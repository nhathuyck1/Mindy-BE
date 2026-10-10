import { validateBinary } from './binary-validation.js';

const [path, filename, mimeType, size] = process.argv.slice(2);
if (!path || !filename || !mimeType || !size) process.exit(2);
try {
  process.stdout.write(
    JSON.stringify(await validateBinary(path, { filename, mimeType, sizeBytes: Number(size) })),
  );
} catch {
  process.exitCode = 2;
}
