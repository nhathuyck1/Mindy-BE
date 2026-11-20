import type { EntityManager } from 'typeorm';

import { CourseEntity } from '../../../modules/catalog/entities/course.entity.js';

/** Fixed Unsplash image URLs, verified as JPEG responses on 2026-10-04. */
export const COURSE_IMAGE_URLS: Readonly<Record<string, string>> = {
  'HTML-CSS-101':
    'https://images.unsplash.com/photo-1498050108023-c5249f4df085?auto=format&fit=crop&w=1200&h=675&q=80',
  'JS-101':
    'https://images.unsplash.com/photo-1515879218367-8466d910aaa4?auto=format&fit=crop&w=1200&h=675&q=80',
  'REACT-201':
    'https://images.unsplash.com/photo-1555066931-4365d14bab8c?auto=format&fit=crop&w=1200&h=675&q=80',
  'NODE-201':
    'https://images.unsplash.com/photo-1558494949-ef010cbdcc31?auto=format&fit=crop&w=1200&h=675&q=80',
  'PY-101':
    'https://images.unsplash.com/photo-1526374965328-7f61d4dc18c5?auto=format&fit=crop&w=1200&h=675&q=80',
  'TS-201':
    'https://images.unsplash.com/photo-1461749280684-dccba630e2f6?auto=format&fit=crop&w=1200&h=675&q=80',
};

/** Fill missing demo images only; retain images assigned by an administrator. */
export async function seedCourseImages(manager: EntityManager): Promise<number> {
  let updated = 0;
  for (const [code, imgUrl] of Object.entries(COURSE_IMAGE_URLS)) {
    const result = await manager
      .getRepository(CourseEntity)
      .createQueryBuilder()
      .update()
      .set({ imgUrl })
      .where('code = :code', { code })
      .andWhere('img_url IS NULL')
      .execute();
    updated += result.affected ?? 0;
  }
  return updated;
}
