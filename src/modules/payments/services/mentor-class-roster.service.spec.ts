import 'reflect-metadata';
import type { DataSource } from 'typeorm';
import { describe, expect, it, vi } from 'vitest';
import { ROLES_METADATA_KEY } from '../../auth/decorators/roles.decorator.js';
import { ClassEntity } from '../../classes/entities/class.entity.js';
import { ClassStatus } from '../../classes/enums/class-status.enum.js';
import type { ClassReadService } from '../../classes/services/class-read.service.js';
import { OrderEntity } from '../../commerce/entities/order.entity.js';
import { OrderDetailEntity } from '../../commerce/entities/order-detail.entity.js';
import { OrderStatus } from '../../commerce/enums/order-status.enum.js';
import { PaymentType } from '../../commerce/enums/payment-type.enum.js';
import { EnrollmentEntity } from '../../enrollments/entities/enrollment.entity.js';
import { EnrollmentStatus } from '../../enrollments/enums/enrollment-status.enum.js';
import { UserEntity } from '../../users/user.entity.js';
import { UserRole } from '../../users/user-role.enum.js';
import { MentorClassRosterController } from '../controllers/mentor-class-roster.controller.js';
import { MentorClassRosterService } from './mentor-class-roster.service.js';

function fixture() {
  const query = {
    where: vi.fn().mockReturnThis(),
    andWhere: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(),
    addOrderBy: vi.fn().mockReturnThis(),
    skip: vi.fn().mockReturnThis(),
    take: vi.fn().mockReturnThis(),
    innerJoin: vi.fn().mockReturnThis(),
    getManyAndCount: vi.fn().mockResolvedValue([[], 0]),
  };
  const classes = {
    createQueryBuilder: vi.fn(() => query),
    findOneBy: vi
      .fn()
      .mockResolvedValue({ id: 'class', mentorId: 'actor', status: ClassStatus.OPEN }),
    find: vi.fn().mockResolvedValue([{ id: 'class', status: ClassStatus.OPEN }]),
  };
  const enrollment = {
    id: 'enrollment',
    studentId: 'student',
    orderDetailId: 'detail',
    status: EnrollmentStatus.PENDING_PAYMENT,
  };
  const repositories = new Map<unknown, unknown>([
    [ClassEntity, classes],
    [EnrollmentEntity, { createQueryBuilder: () => query }],
    [
      OrderDetailEntity,
      {
        find: vi
          .fn()
          .mockResolvedValue([
            { id: 'detail', orderId: 'order', classId: 'class', totalAmount: 100 },
          ]),
      },
    ],
    [
      OrderEntity,
      {
        find: vi.fn().mockResolvedValue([
          {
            id: 'order',
            orderCode: 'MD-TEST',
            paymentType: PaymentType.CASH,
            cashMentorId: 'actor',
            status: OrderStatus.PENDING,
            totalAmount: 100,
            expiresAt: new Date('2099-01-01'),
            paidAt: null,
          },
        ]),
      },
    ],
    [UserEntity, { find: vi.fn().mockResolvedValue([{ id: 'student', displayName: 'Học viên' }]) }],
  ]);
  const db = {
    getRepository: (entity: unknown) => repositories.get(entity),
  } as unknown as DataSource;
  const read = { toViews: vi.fn().mockResolvedValue([]) } as unknown as ClassReadService;
  return { service: new MentorClassRosterService(db, read), query, classes, enrollment };
}
describe('manager roster read permissions', () => {
  it('lists all classes for managers while keeping the mentor scope and filters', async () => {
    const { service, query } = fixture();
    await service.classes(
      'actor',
      { page: 2, pageSize: 20, status: ClassStatus.OPEN },
      UserRole.MANAGER,
    );
    expect(query.where).not.toHaveBeenCalled();
    expect(query.andWhere).toHaveBeenCalledWith('class.status = :status', {
      status: ClassStatus.OPEN,
    });
    expect(query.skip).toHaveBeenCalledWith(20);
    await service.classes('actor', { page: 1, pageSize: 20 });
    expect(query.where).toHaveBeenCalledWith('class.mentorId = :mentorId', { mentorId: 'actor' });
  });
  it('lets managers read another mentor roster but never confirm cash', async () => {
    const { service, query, classes, enrollment } = fixture();
    query.getManyAndCount.mockResolvedValue([[enrollment], 1]);
    const result = await service.students(
      'actor',
      'class',
      { page: 1, pageSize: 20 },
      UserRole.MANAGER,
    );
    expect(classes.findOneBy).toHaveBeenLastCalledWith({ id: 'class' });
    expect(result.items[0]).toMatchObject({ studentId: 'student', canConfirmCash: false });
    const mentor = await service.students('actor', 'class', { page: 1, pageSize: 20 });
    expect(classes.findOneBy).toHaveBeenLastCalledWith({ id: 'class', mentorId: 'actor' });
    expect(mentor.items[0]).toMatchObject({ canConfirmCash: true });
  });
  it('keeps not-found and denies roles outside mentor/manager', async () => {
    const { service, classes, query } = fixture();
    classes.findOneBy.mockResolvedValue(null);
    await expect(
      service.students('actor', 'missing', { page: 1, pageSize: 20 }, UserRole.MANAGER),
    ).rejects.toMatchObject({ status: 404 });
    for (const role of [UserRole.ADMIN, UserRole.STUDENT]) {
      await expect(service.classes('actor', { page: 1, pageSize: 20 }, role)).rejects.toMatchObject(
        { status: 403 },
      );
      await expect(
        service.students('actor', 'class', { page: 1, pageSize: 20 }, role),
      ).rejects.toMatchObject({ status: 403 });
    }
    expect(query.getManyAndCount).not.toHaveBeenCalled();
  });
  it('controller allows only manager/mentor and passes the authenticated role', async () => {
    expect(Reflect.getMetadata(ROLES_METADATA_KEY, MentorClassRosterController)).toEqual([
      UserRole.MENTOR,
      UserRole.MANAGER,
    ]);
    const service = {
      classes: vi.fn().mockResolvedValue({ items: [], total: 0 }),
      students: vi.fn().mockResolvedValue({ items: [], total: 0 }),
    };
    const controller = new MentorClassRosterController(
      service as unknown as MentorClassRosterService,
    );
    const user = { userId: 'actor', sessionId: 'session', role: UserRole.MANAGER };
    const options = { page: 1, pageSize: 20 };
    await controller.classes(user, options);
    await controller.students(user, 'class', options);
    expect(service.classes).toHaveBeenCalledWith('actor', options, UserRole.MANAGER);
    expect(service.students).toHaveBeenCalledWith('actor', 'class', options, UserRole.MANAGER);
  });
});
