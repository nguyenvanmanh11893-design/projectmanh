import { GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { createValidator } from './validator.js';

const client = new S3Client({ region: process.env.AWS_REGION });
const storage = {
  async getObject({ bucket, key, versionId }) {
    const result = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key, VersionId: versionId }));
    return { contentLength: result.ContentLength, body: result.Body };
  },
  async putObject({ bucket, key, body, contentType }) {
    await client.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: body, ContentType: contentType }));
  }
};

export const handler = async (event) => createValidator({ storage }).handle(event);
