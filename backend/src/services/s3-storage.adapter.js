import { CopyObjectCommand, DeleteObjectCommand, DeleteObjectsCommand, GetObjectCommand, HeadObjectCommand, ListObjectVersionsCommand } from '@aws-sdk/client-s3';
import { createPresignedPost } from '@aws-sdk/s3-presigned-post';
import { s3Client, S3_BUCKET_NAME } from '../config/aws.js';

export class PartialDeleteError extends Error {
  constructor(failures) {
    super('S3 did not confirm deletion of every requested object version');
    this.name = 'PartialDeleteError';
    this.failures = failures;
  }
}

// The adapter is intentionally small: application code depends on this
// contract, while unit tests can provide an in-memory implementation.
const createS3StorageAdapter = ({ client = s3Client, bucket = S3_BUCKET_NAME, presignPost = createPresignedPost } = {}) => {
  const createDirectUploadPost = async ({ key, contentType, contentLength, expiresInSeconds }) => {
    if (!bucket) throw new Error('AWS_S3_BUCKET is not configured');
    return presignPost(client, {
      Bucket: bucket,
      Key: key,
      Expires: expiresInSeconds,
      Fields: {
        key,
        'Content-Type': contentType,
        success_action_status: '201'
      },
      Conditions: [
        { bucket },
        ['eq', '$key', key],
        ['eq', '$Content-Type', contentType],
        ['eq', '$success_action_status', '201'],
        ['content-length-range', contentLength, contentLength]
      ]
    });
  };

  const headObject = async ({ key, versionId }) => {
    if (!bucket) throw new Error('AWS_S3_BUCKET is not configured');
    const result = await client.send(new HeadObjectCommand({ Bucket: bucket, Key: key, VersionId: versionId }));
    return { contentLength: result.ContentLength, contentType: result.ContentType };
  };

  const getObjectText = async ({ key }) => {
    if (!bucket) throw new Error('AWS_S3_BUCKET is not configured');
    const result = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
    if (!result.Body?.[Symbol.asyncIterator]) throw new Error('S3 report body is unreadable');
    const chunks = []; let size = 0;
    for await (const chunk of result.Body) {
      const bytes = Buffer.from(chunk); size += bytes.length;
      if (size > 16384) { result.Body.destroy?.(); throw new Error('Validator report exceeds size limit'); }
      chunks.push(bytes);
    }
    return Buffer.concat(chunks).toString('utf8');
  };

  const copyObjectVersion = async ({ sourceKey, sourceVersionId, destinationKey }) => {
    if (!bucket) throw new Error('AWS_S3_BUCKET is not configured');
    // CopySource is encoded as one value; VersionId pins the object the Lambda
    // inspected rather than whichever incoming object is current.
    const copySource = `${encodeURIComponent(bucket)}/${sourceKey.split('/').map(encodeURIComponent).join('/')}?versionId=${encodeURIComponent(sourceVersionId)}`;
    const result = await client.send(new CopyObjectCommand({ Bucket: bucket, Key: destinationKey, CopySource: copySource }));
    if (!result.VersionId || result.VersionId === 'null') throw new Error('S3 CopyObject did not return an immutable destination version ID');
    return { versionId: result.VersionId };
  };

  const deleteObjectVersion = async ({ key, versionId }) => {
    if (!bucket) throw new Error('AWS_S3_BUCKET is not configured');
    await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key, VersionId: versionId }));
  };

  const listObjectVersionsPage = async ({ prefix, keyMarker, versionIdMarker, maxKeys = 1000 }) => {
    if (!bucket) throw new Error('AWS_S3_BUCKET is not configured');
    const result = await client.send(new ListObjectVersionsCommand({
      Bucket: bucket, Prefix: prefix, KeyMarker: keyMarker, VersionIdMarker: versionIdMarker, MaxKeys: maxKeys
    }));
    const map = (entry, isDeleteMarker) => ({ key: entry.Key, versionId: entry.VersionId, isDeleteMarker, lastModified: entry.LastModified || null });
    return {
      items: [
        ...(result.Versions || []).map((entry) => map(entry, false)),
        ...(result.DeleteMarkers || []).map((entry) => map(entry, true))
      ],
      isTruncated: Boolean(result.IsTruncated),
      nextKeyMarker: result.NextKeyMarker || null,
      nextVersionIdMarker: result.NextVersionIdMarker || null
    };
  };

  const listExactObjectVersions = async ({ key }) => {
    const items = [];
    let keyMarker; let versionIdMarker;
    do {
      const page = await listObjectVersionsPage({ prefix: key, keyMarker, versionIdMarker });
      // A versioned bucket can still contain a literal "null" version from
      // before versioning was enabled. It is deletable only when explicitly
      // included as VersionId="null", so do not silently filter it out.
      items.push(...page.items.filter((item) => item.key === key && typeof item.versionId === 'string' && item.versionId.length > 0));
      keyMarker = page.nextKeyMarker || undefined;
      versionIdMarker = page.nextVersionIdMarker || undefined;
      if (!page.isTruncated) break;
      if (!keyMarker) throw new Error('S3 version listing was truncated without a continuation marker');
      // ListObjectVersions is key-ordered. Once the continuation key has
      // advanced beyond the exact key, only prefix collisions can remain.
      if (keyMarker !== key) break;
    } while (true);
    return items;
  };

  const deleteObjectVersions = async ({ objects }) => {
    if (!bucket) throw new Error('AWS_S3_BUCKET is not configured');
    const failures = [];
    for (let offset = 0; offset < objects.length; offset += 1000) {
      const batch = objects.slice(offset, offset + 1000);
      const result = await client.send(new DeleteObjectsCommand({
        Bucket: bucket,
        Delete: { Quiet: false, Objects: batch.map(({ key, versionId }) => ({ Key: key, VersionId: versionId })) }
      }));
      const acknowledged = new Set((result.Deleted || []).map((item) => `${item.Key}\0${item.VersionId}`));
      const errors = new Map((result.Errors || []).map((item) => [`${item.Key}\0${item.VersionId}`, item.Code || 'DELETE_FAILED']));
      for (const item of batch) {
        const identity = `${item.key}\0${item.versionId}`;
        if (!acknowledged.has(identity)) failures.push({ key: item.key, versionId: item.versionId, code: errors.get(identity) || 'UNCONFIRMED_DELETE' });
      }
    }
    if (failures.length) throw new PartialDeleteError(failures);
  };

  return { createDirectUploadPost, headObject, getObjectText, copyObjectVersion, deleteObjectVersion, listObjectVersionsPage, listExactObjectVersions, deleteObjectVersions };
};

export { createS3StorageAdapter };
