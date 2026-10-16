import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsEnum,
  IsIn,
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
} from 'class-validator';
import { PageOptionsDto } from '../../../common/dtos/page-options.dto.js';
import { AdminClassPageOptionsDto } from '../../classes/dtos/class-page-options.dto.js';
import { ClassStatus } from '../../classes/enums/class-status.enum.js';
import { OrderStatus } from '../../commerce/enums/order-status.enum.js';
import { PaymentType } from '../../commerce/enums/payment-type.enum.js';
import { EnrollmentStatus } from '../../enrollments/enums/enrollment-status.enum.js';
import { PaymentStatus } from '../../payments/enums/payment-status.enum.js';
import { UserStatus } from '../../users/user-status.enum.js';
export class ManagerClassQueryDto extends AdminClassPageOptionsDto {
  @ApiPropertyOptional({ type: String, minLength: 1, maxLength: 100 })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @Length(1, 100)
  readonly q?: string;
}
export class ManagerPeopleQueryDto extends PageOptionsDto {
  @ApiPropertyOptional({ type: String, minLength: 1, maxLength: 100 })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @Length(1, 100)
  readonly q?: string;
  @ApiPropertyOptional({ enum: [UserStatus.ACTIVE, UserStatus.SUSPENDED] })
  @IsOptional()
  @IsIn([UserStatus.ACTIVE, UserStatus.SUSPENDED])
  readonly status?: UserStatus;
}
export enum MentorAssignment {
  PRIMARY = 'PRIMARY',
  SUBSTITUTE = 'SUBSTITUTE',
  ANY = 'ANY',
}
export class ManagerMentorClassesQueryDto extends PageOptionsDto {
  @ApiPropertyOptional({ enum: ClassStatus })
  @IsOptional()
  @IsEnum(ClassStatus)
  readonly status?: ClassStatus;
  @ApiPropertyOptional({ enum: MentorAssignment, default: MentorAssignment.ANY })
  @IsOptional()
  @IsEnum(MentorAssignment)
  readonly assignment: MentorAssignment = MentorAssignment.ANY;
}
export class ManagerMentorScheduleQueryDto extends PageOptionsDto {
  @ApiProperty({ type: String, format: 'date-time' })
  @IsISO8601({ strict: true })
  @Matches(/T.*(Z|[+-]\d{2}:\d{2})$/)
  readonly from!: string;
  @ApiProperty({ type: String, format: 'date-time' })
  @IsISO8601({ strict: true })
  @Matches(/T.*(Z|[+-]\d{2}:\d{2})$/)
  readonly to!: string;
  @ApiPropertyOptional({ enum: MentorAssignment, default: MentorAssignment.ANY })
  @IsOptional()
  @IsEnum(MentorAssignment)
  readonly assignment: MentorAssignment = MentorAssignment.ANY;
}
export class ManagerStudentClassesQueryDto extends PageOptionsDto {
  @ApiPropertyOptional({ enum: EnrollmentStatus })
  @IsOptional()
  @IsEnum(EnrollmentStatus)
  readonly enrollmentStatus?: EnrollmentStatus;
  @ApiPropertyOptional({ enum: ClassStatus })
  @IsOptional()
  @IsEnum(ClassStatus)
  readonly classStatus?: ClassStatus;
}
export class ManagerFinanceQueryDto extends PageOptionsDto {
  @ApiPropertyOptional({ type: String, format: 'uuid' })
  @IsOptional()
  @IsUUID('4')
  readonly studentId?: string;
  @ApiPropertyOptional({ type: String, format: 'uuid' })
  @IsOptional()
  @IsUUID('4')
  readonly classId?: string;
  @ApiPropertyOptional({ enum: PaymentType })
  @IsOptional()
  @IsEnum(PaymentType)
  readonly paymentType?: PaymentType;
  @ApiPropertyOptional({ type: String, format: 'date-time' })
  @IsOptional()
  @IsISO8601({ strict: true })
  @Matches(/T.*(Z|[+-]\d{2}:\d{2})$/)
  readonly from?: string;
  @ApiPropertyOptional({ type: String, format: 'date-time' })
  @IsOptional()
  @IsISO8601({ strict: true })
  @Matches(/T.*(Z|[+-]\d{2}:\d{2})$/)
  readonly to?: string;
}
export class ManagerOrdersQueryDto extends ManagerFinanceQueryDto {
  @ApiPropertyOptional({ enum: OrderStatus })
  @IsOptional()
  @IsEnum(OrderStatus)
  readonly status?: OrderStatus;
  @ApiPropertyOptional({ type: String, minLength: 1, maxLength: 50 })
  @IsOptional()
  @IsString()
  @Length(1, 50)
  readonly orderCode?: string;
}
export enum PaymentDateField {
  CREATED_AT = 'CREATED_AT',
  PAID_AT = 'PAID_AT',
}
export class ManagerPaymentsQueryDto extends ManagerFinanceQueryDto {
  @ApiPropertyOptional({ type: String, format: 'uuid' })
  @IsOptional()
  @IsUUID('4')
  readonly orderId?: string;
  @ApiPropertyOptional({ enum: PaymentStatus })
  @IsOptional()
  @IsEnum(PaymentStatus)
  readonly status?: PaymentStatus;
  @ApiPropertyOptional({ enum: PaymentDateField, default: PaymentDateField.CREATED_AT })
  @IsOptional()
  @IsEnum(PaymentDateField)
  readonly dateField: PaymentDateField = PaymentDateField.CREATED_AT;
}
