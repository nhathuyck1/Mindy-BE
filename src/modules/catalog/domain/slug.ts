const COMBINING_MARKS = /[̀-ͯ]/g;

/** Builds a URL slug from a display name, folding Vietnamese diacritics to ASCII. */
export function slugify(value: string): string {
  return value
    .normalize('NFD')
    .replace(COMBINING_MARKS, '')
    .replace(/[đĐ]/g, 'd')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}
