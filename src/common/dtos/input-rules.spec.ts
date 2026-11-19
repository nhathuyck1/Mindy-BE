import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { describe, expect, it } from 'vitest';

import { RegisterDto } from '../../modules/auth/dtos/register.dto.js';
import { AddCourseUnitDto } from '../../modules/catalog/dtos/add-course-unit.dto.js';
import { CreateCourseDto } from '../../modules/catalog/dtos/create-course.dto.js';
import { CreateCourseCategoryDto } from '../../modules/catalog/dtos/create-course-category.dto.js';
import { UpdateCourseDto } from '../../modules/catalog/dtos/update-course.dto.js';
import { CreateClassDto } from '../../modules/classes/dtos/create-class.dto.js';
import { ScheduleClassSessionDto } from '../../modules/classes/dtos/schedule-class-session.dto.js';
import { UpdateClassDto } from '../../modules/classes/dtos/update-class.dto.js';
import { CreateUserDto } from '../../modules/users/dtos/create-user.dto.js';
import { UpdateUserStatusDto } from '../../modules/users/dtos/update-user-status.dto.js';
import { UserSelfStatusChangeException } from '../../modules/users/exceptions/user.exceptions.js';
import { UserStatus } from '../../modules/users/user-status.enum.js';
import { UsersService } from '../../modules/users/users.service.js';

const uuid = '11111111-1111-4111-8111-111111111111';

async function failedProperties(Dto: new () => object, input: object): Promise<string[]> {
  const errors = await validate(plainToInstance(Dto, input));
  return errors.map((error) => error.property);
}

describe('submission input rules', () => {
  const course = { categoryId: uuid, code: 'WEB-101', title: 'Web', priceAmount: 1000 };

  it('requires a course price of at least 1 VND', async () => {
    expect(await failedProperties(CreateCourseDto, course)).toEqual([]);
    expect(await failedProperties(CreateCourseDto, { ...course, priceAmount: 0 })).toEqual([
      'priceAmount',
    ]);
    expect(await failedProperties(UpdateCourseDto, { priceAmount: 0 })).toEqual(['priceAmount']);
    expect(await failedProperties(UpdateCourseDto, { priceAmount: 1 })).toEqual([]);
  });

  it.each([
    [CreateCourseDto, course, 'title'],
    [UpdateCourseDto, {}, 'title'],
    [AddCourseUnitDto, {}, 'title'],
    [CreateCourseCategoryDto, {}, 'name'],
    [
      CreateClassDto,
      {
        courseId: uuid,
        mentorId: uuid,
        code: 'WEB-01',
        startDate: '2026-12-01',
        endDate: '2026-12-31',
        maxStudents: 10,
        deliveryMode: 'ONLINE',
      },
      'name',
    ],
    [UpdateClassDto, {}, 'name'],
    [
      ScheduleClassSessionDto,
      {
        classUnitId: uuid,
        startsAt: '2026-12-01T19:00:00+07:00',
        endsAt: '2026-12-01T21:00:00+07:00',
      },
      'title',
    ],
    [
      CreateUserDto,
      { email: 'a@example.com', password: 'secret1', role: 'STUDENT' },
      'displayName',
    ],
  ] as const)('rejects a whitespace-only %o.%s', async (Dto, base, field) => {
    expect(await failedProperties(Dto, { ...base, [field]: 'Valid' })).toEqual([]);
    expect(await failedProperties(Dto, { ...base, [field]: '   ' })).toEqual([field]);
  });

  it('accepts common phone formats and rejects text', async () => {
    const base = { email: 'a@example.com', password: 'secret1', displayName: 'An' };
    for (const phone of ['0901234567', '+84901234567', '0901 234 567', '090.123.4567'])
      expect(await failedProperties(RegisterDto, { ...base, phone })).toEqual([]);
    for (const phone of ['abcdefg', '0901  234567', '+84-', '12345678901234567'])
      expect(await failedProperties(RegisterDto, { ...base, phone })).toEqual(['phone']);
  });

  it('lets an admin set only ACTIVE or SUSPENDED, never on their own account', async () => {
    expect(await failedProperties(UpdateUserStatusDto, { status: 'SUSPENDED' })).toEqual([]);
    expect(
      await failedProperties(UpdateUserStatusDto, { status: UserStatus.PENDING_VERIFICATION }),
    ).toEqual(['status']);
    const service = new UsersService(null as never);
    await expect(service.updateStatus(uuid, UserStatus.SUSPENDED, uuid)).rejects.toBeInstanceOf(
      UserSelfStatusChangeException,
    );
  });
});
