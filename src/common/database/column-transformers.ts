import type { ValueTransformer } from 'typeorm';

/**
 * PostgreSQL returns bigint/numeric columns as strings. VND amounts and percentages used by
 * the application stay far below Number.MAX_SAFE_INTEGER, so they are mapped to numbers.
 */
export const numericColumnTransformer: ValueTransformer = {
  to: (value: number | null | undefined): number | null | undefined => value,
  from: (value: string | null | undefined): number | null | undefined =>
    value === null || value === undefined ? value : Number(value),
};
