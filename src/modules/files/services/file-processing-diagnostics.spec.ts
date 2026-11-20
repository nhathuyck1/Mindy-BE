import { describe, expect, it } from 'vitest';
import { fileProcessingDiagnostics } from './file-processing-diagnostics.js';

describe('file processing diagnostics', () => {
  it('reports filesystem and nested connection codes', () => {
    const error = Object.assign(new Error('secret signed URL'), {
      code: 'EACCES',
      cause: { code: 'ECONNREFUSED' },
    });
    expect(fileProcessingDiagnostics(error)).toEqual({
      errorName: 'Error',
      causeCode: 'EACCES',
      nestedCauseCode: 'ECONNREFUSED',
    });
  });

  it('reports SDK status without exposing request details', () => {
    const error = Object.assign(new Error('https://storage/private?signature=secret'), {
      name: 'AccessDenied',
      $metadata: { httpStatusCode: 403 },
      stack: 'private credentials',
    });
    const result = fileProcessingDiagnostics(error);
    expect(result).toMatchObject({ errorName: 'AccessDenied', httpStatus: 403 });
    expect(JSON.stringify(result)).not.toMatch(/secret|private|signature/);
  });

  it('ignores arbitrary content in identifier fields and non-object exceptions', () => {
    expect(
      fileProcessingDiagnostics({ code: 'https://storage?secret', name: 'bad\nlog' }),
    ).toMatchObject({ causeCode: undefined, errorName: undefined });
    expect(fileProcessingDiagnostics(null)).toEqual({});
    expect(fileProcessingDiagnostics('secret')).toEqual({});
  });
});
