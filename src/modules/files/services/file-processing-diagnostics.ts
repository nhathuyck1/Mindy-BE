// Allow only diagnostic identifiers; SDK messages/stacks may contain signed URLs.
function identifier(value: unknown): string | number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && /^[A-Za-z0-9_.:-]{1,100}$/.test(value)) return value;
  return undefined;
}

export function fileProcessingDiagnostics(error: unknown) {
  if (typeof error !== 'object' || error === null) return {};
  const metadata = '$metadata' in error ? error.$metadata : undefined;
  const cause = 'cause' in error ? error.cause : undefined;
  return {
    errorName: identifier('name' in error ? error.name : undefined),
    causeCode: identifier('code' in error ? error.code : undefined),
    httpStatus:
      typeof metadata === 'object' && metadata !== null && 'httpStatusCode' in metadata
        ? identifier(metadata.httpStatusCode)
        : undefined,
    nestedCauseCode:
      typeof cause === 'object' && cause !== null && 'code' in cause
        ? identifier(cause.code)
        : undefined,
  };
}
