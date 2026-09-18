import { GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { createValidator, createReportId } from './validator.js';

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

export const handler = async (event, context) => {
  const request_id = context?.awsRequestId;
  try {
    for (const record of event?.Records || []) {
      const bucket = record?.s3?.bucket?.name;
      const key = decodeURIComponent((record?.s3?.object?.key || '').replace(/\+/g, ' '));
      const versionId = record?.s3?.object?.versionId;
      if (bucket && key.startsWith('incoming/') && versionId) console.log(JSON.stringify({ timestamp: new Date().toISOString(), level: 'info', event: 'validation_started', request_id, report_id: createReportId({ bucket, key, versionId }) }));
    }
    const results = await createValidator({ storage }).handle(event);
    for (const result of results) console.log(JSON.stringify({ timestamp: new Date().toISOString(), level: 'info', event: 'validation_finished', request_id, report_id: result.report?.report_id, status: result.report?.status }));
    return results;
  } catch {
    console.error(JSON.stringify({ timestamp: new Date().toISOString(), level: 'error', event: 'validation_failed', request_id }));
    // Never let the Lambda runtime serialize raw SDK exceptions/URLs.
    throw new Error('VALIDATION_FAILED');
  }
};
