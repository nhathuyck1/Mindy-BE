// Read-only check: an HTTP 204 alone does not mean the browser may upload.
const [endpoint, origin = 'http://localhost:3001'] = process.argv.slice(2);
if (!endpoint)
  throw new Error('Usage: node tools/minio/check-browser-cors.mjs <storage-url> [frontend-origin]');
const response = await fetch(endpoint, {
  method: 'OPTIONS',
  headers: {
    Origin: origin,
    'Access-Control-Request-Method': 'PUT',
    'Access-Control-Request-Headers': 'content-type',
  },
  signal: AbortSignal.timeout(15000),
});
const allowedOrigin = response.headers.get('access-control-allow-origin');
const methods = (response.headers.get('access-control-allow-methods') ?? '')
  .split(',')
  .map((value) => value.trim().toUpperCase());
const headers = (response.headers.get('access-control-allow-headers') ?? '')
  .split(',')
  .map((value) => value.trim().toLowerCase());
if (
  !response.ok ||
  allowedOrigin !== origin ||
  !methods.includes('PUT') ||
  !headers.includes('content-type')
) {
  console.error(
    `Storage CORS blocked for ${origin}: HTTP ${response.status}, allow-origin=${allowedOrigin ?? '(missing)'}, allow-methods=${methods.join(',') || '(missing)'}, allow-headers=${headers.join(',') || '(missing)'}`,
  );
  process.exitCode = 1;
} else {
  console.log(
    `Storage permits image uploads from ${origin}. Verify a signed PUT and READY status next.`,
  );
}
