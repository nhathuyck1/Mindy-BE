import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsBoolean, IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import {
  NOTIFICATION_CATEGORIES,
  type NotificationCategory,
} from '../domain/notification-catalog.js';

export class NotificationQuery {
  @ApiPropertyOptional({ enum: NOTIFICATION_CATEGORIES, default: 'ALL' })
  @IsIn(NOTIFICATION_CATEGORIES)
  category: NotificationCategory = 'ALL';

  @ApiPropertyOptional({ minimum: 1, maximum: 100, default: 20 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 20;

  @ApiPropertyOptional({ maxLength: 2048 })
  @IsOptional()
  @IsString()
  @MaxLength(2048)
  cursor?: string;

  @ApiPropertyOptional({ default: false })
  @Transform(({ value }: { value: unknown }) =>
    value === 'true' ? true : value === 'false' ? false : value,
  )
  @IsBoolean()
  unreadOnly = false;
}

export class NotificationScopeQuery {
  @ApiPropertyOptional({ enum: ['ALL', 'BUSINESS'], default: 'ALL' })
  @IsIn(['ALL', 'BUSINESS'])
  category: 'ALL' | 'BUSINESS' = 'ALL';
}

export class EmptyNotificationInput {}

export class NotificationCountDto {
  @ApiProperty({ minimum: 0 }) unreadCount!: number;
}

export class NotificationReadAllDto {
  @ApiProperty({ format: 'date-time' }) readAt!: string;
  @ApiProperty({ enum: [true] }) resyncRequired!: true;
}

export class NotificationPageMetaDto {
  @ApiProperty() hasMore!: boolean;
  @ApiProperty({ nullable: true }) nextCursor!: string | null;
}

export class NotificationTargetDto {
  @ApiProperty() kind!: string;
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiPropertyOptional({ format: 'uuid' }) contextId?: string;
  @ApiProperty() available!: boolean;
}

export class NotificationDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() type!: string;
  @ApiProperty() category!: string;
  @ApiProperty({ nullable: true }) actorId!: string | null;
  @ApiProperty({ nullable: true }) conversationId!: string | null;
  @ApiProperty({ nullable: true }) messageId!: string | null;
  @ApiProperty() title!: string;
  @ApiProperty() body!: string;
  @ApiProperty({ type: 'object', additionalProperties: { type: 'string' } }) data!: Record<
    string,
    string
  >;
  @ApiProperty({ nullable: true, format: 'date-time' }) readAt!: string | null;
  @ApiProperty({ format: 'date-time' }) createdAt!: string;
  @ApiProperty({ type: NotificationTargetDto }) target!: NotificationTargetDto;

  constructor(value: NotificationDto) {
    Object.assign(this, value);
  }
}

export class NotificationPageDto {
  @ApiProperty({ type: [NotificationDto] }) data!: NotificationDto[];
  @ApiProperty({ type: NotificationPageMetaDto }) meta!: NotificationPageMetaDto;
}

export interface NotificationRow {
  id: string;
  user_id: string;
  type: string;
  actor_id: string | null;
  conversation_id: string | null;
  message_id: string | null;
  read_at: Date | null;
  created_at: Date;
  event_id: string | null;
  resource_kind: string | null;
  resource_id: string | null;
  context_id: string | null;
  context_ids: string[] | null;
  relation_keys: string[] | null;
  revision: string | null;
  recipient_role: string | null;
  terminal: boolean | null;
}
