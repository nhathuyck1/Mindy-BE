import { validate } from 'class-validator';
import { describe, expect, it } from 'vitest';

import { CreateCourseDto } from './create-course.dto.js';
import { UpdateCourseDto } from './update-course.dto.js';

describe('course image input', () => {
  it.each([CreateCourseDto, UpdateCourseDto])(
    'validates optional HTTP/HTTPS URLs in %s',
    async (Dto) => {
      const base = {
        categoryId: '11111111-1111-4111-8111-111111111111',
        code: 'IMG-101',
        title: 'Course',
        priceAmount: 100_000,
      };
      for (const imgUrl of [
        undefined,
        null,
        'https://cdn.example.com/image.jpg',
        'http://cdn.example.com/image.jpg',
      ]) {
        expect(await validate(Object.assign(new Dto(), base, { imgUrl }))).toEqual([]);
      }
      for (const imgUrl of [
        '',
        'not-a-url',
        'ftp://cdn.example.com/image.jpg',
        'javascript:alert(1)',
        'https://user:pass@example.com/image.jpg',
        `https://cdn.example.com/${'a'.repeat(2048)}`,
      ]) {
        const errors = await validate(Object.assign(new Dto(), base, { imgUrl }));
        expect(errors.some((error) => error.property === 'imgUrl')).toBe(true);
      }
    },
  );
});
