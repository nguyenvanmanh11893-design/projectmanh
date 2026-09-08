const { PutObjectCommand, GetObjectCommand, DeleteObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const { s3Client, S3_BUCKET_NAME } = require('../config/aws');

/**
 * Upload binary file buffer to Amazon S3
 */
const uploadToS3 = async ({ buffer, key, mimeType }) => {
  const command = new PutObjectCommand({
    Bucket: S3_BUCKET_NAME,
    Key: key,
    Body: buffer,
    ContentType: mimeType
  });

  // Execute S3 command
  return await s3Client.send(command);
};

/**
 * Generate S3 Presigned URL for downloading file directly from S3
 */
const generatePresignedDownloadUrl = async ({ key, originalName, expiresInSeconds = 3600 }) => {
  const command = new GetObjectCommand({
    Bucket: S3_BUCKET_NAME,
    Key: key,
    ResponseContentDisposition: `attachment; filename="${encodeURIComponent(originalName)}"`
  });

  return await getSignedUrl(s3Client, command, { expiresIn: expiresInSeconds });
};

/**
 * Delete file object from Amazon S3
 */
const deleteFromS3 = async ({ key }) => {
  const command = new DeleteObjectCommand({
    Bucket: S3_BUCKET_NAME,
    Key: key
  });

  return await s3Client.send(command);
};

module.exports = {
  uploadToS3,
  generatePresignedDownloadUrl,
  deleteFromS3
};
