import { validateZip, ZipValidationError } from './zip-validation.js';

try {
  const path = process.argv[2];
  if (!path) throw new ZipValidationError();
  await validateZip(path);
  process.stdout.write('OK');
} catch (error) {
  process.stderr.write(error instanceof ZipValidationError ? error.code : 'ZIP_INVALID');
  process.exitCode = 2;
}
