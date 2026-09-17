import { S3Client } from '@aws-sdk/client-s3';

const region = process.env.AWS_REGION;
const s3Client = new S3Client({ region });
const S3_BUCKET_NAME = process.env.AWS_S3_BUCKET;

export {
  s3Client,
  S3_BUCKET_NAME
};
