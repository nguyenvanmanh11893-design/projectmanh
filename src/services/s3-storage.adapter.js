import { CopyObjectCommand, DeleteObjectCommand, GetObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3';
import { createPresignedPost } from '@aws-sdk/s3-presigned-post';
import { s3Client, S3_BUCKET_NAME } from '../config/aws.js';

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

  return { createDirectUploadPost, headObject, getObjectText, copyObjectVersion, deleteObjectVersion };
};

export { createS3StorageAdapter };
