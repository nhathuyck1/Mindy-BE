import {
  CreateBucketCommand,
  GetBucketPolicyCommand,
  GetBucketVersioningCommand,
  HeadBucketCommand,
  PutBucketVersioningCommand,
  S3Client,
} from '@aws-sdk/client-s3';

// Local-only compose fixture, intentionally independent of .env or production credentials.
const Bucket = 'mindy-center-local';
const client = new S3Client({
  endpoint: 'http://127.0.0.1:19000',
  region: 'us-east-1',
  forcePathStyle: true,
  credentials: {
    accessKeyId: 'mindy-files-test',
    secretAccessKey: 'mindy-files-test-only-password',
  },
  maxAttempts: 1,
});
try {
  try {
    await client.send(new HeadBucketCommand({ Bucket }));
  } catch (error) {
    if (error?.$metadata?.httpStatusCode !== 404) throw error;
    await client.send(new CreateBucketCommand({ Bucket }));
  }
  // Refuse an existing policy; provisioning must never silently alter bucket access.
  try {
    const policy = await client.send(new GetBucketPolicyCommand({ Bucket }));
    if (policy.Policy && policy.Policy !== '{}')
      throw new Error('Local bucket must have no policy');
  } catch (error) {
    if (error?.name !== 'NoSuchBucketPolicy') throw error;
  }
  await client.send(
    new PutBucketVersioningCommand({ Bucket, VersioningConfiguration: { Status: 'Enabled' } }),
  );
  const result = await client.send(new GetBucketVersioningCommand({ Bucket }));
  if (result.Status !== 'Enabled') throw new Error('Versioning is required');
  console.log(`Local private versioned bucket ready: ${Bucket} at http://127.0.0.1:19000`);
} finally {
  client.destroy();
}
