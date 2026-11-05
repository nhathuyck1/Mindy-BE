import 'dotenv/config';

import dataSource from '../data-source.js';
import { seedCourseImages } from './helpers/course-images.js';

if (process.env.NODE_ENV === 'production' && process.env.SEED_DEMO_CONFIRM !== 'YES') {
  throw new Error('Demo images are not seeded in production unless SEED_DEMO_CONFIRM=YES is set');
}

await dataSource.initialize();
try {
  const updated = await dataSource.transaction(seedCourseImages);
  console.log(
    `Course image seed done: ${updated} missing image(s) filled; existing images preserved.`,
  );
} finally {
  await dataSource.destroy();
}
