import { HeadObjectCommand } from '@aws-sdk/client-s3';
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

  return { createDirectUploadPost, headObject };
};

export { createS3StorageAdapter };
