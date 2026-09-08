const { S3Client } = require('@aws-sdk/client-s3');

const region = process.env.AWS_REGION || 'ap-southeast-1';
const accessKeyId = process.env.AWS_ACCESS_KEY_ID || 'mock_access_key';
const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY || 'mock_secret_key';

const s3Client = new S3Client({
  region,
  credentials: {
    accessKeyId,
    secretAccessKey
  }
});

const S3_BUCKET_NAME = process.env.AWS_S3_BUCKET || 'cloud-file-manager-bucket';

module.exports = {
  s3Client,
  S3_BUCKET_NAME
};
