/** Business codes are stored upper-case so uniqueness does not depend on letter case. */
export function normalizeCode(value: string): string {
  return value.trim().toUpperCase();
}

export function normalizeOptionalText(value: string | null | undefined): string | null {
  const normalized = value?.trim();
  return normalized === undefined || normalized.length === 0 ? null : normalized;
}
