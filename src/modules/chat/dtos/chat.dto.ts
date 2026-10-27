import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
} from 'class-validator';

export class ChatPageQuery {
  @ApiPropertyOptional({ default: 20, minimum: 1, maximum: 100 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  readonly limit: number = 20;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(2048) readonly cursor?: string;
}
export class ConversationQuery extends ChatPageQuery {
  @ApiPropertyOptional({ enum: ['GROUP', 'DIRECT'] })
  @IsOptional()
  @IsIn(['GROUP', 'DIRECT'])
  readonly type?: 'GROUP' | 'DIRECT';
}
export class NotificationQuery extends ChatPageQuery {
  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  @Transform(({ value }: { value: unknown }) =>
    value === 'true' ? true : value === 'false' ? false : value,
  )
  readonly unreadOnly?: boolean;
}
export class DirectChatInput {
  @ApiProperty() @IsUUID('4') readonly peerUserId!: string;
}
export class SendChatInput {
  @ApiProperty() @IsUUID('4') readonly clientMessageId!: string;
  @ApiProperty({ enum: ['TEXT', 'FILE', 'IMAGE'] }) @IsIn(['TEXT', 'FILE', 'IMAGE']) readonly type!:
    | 'TEXT'
    | 'FILE'
    | 'IMAGE';
  @ApiProperty({ maxLength: 4000 })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(4000)
  @Matches(/\S/u)
  readonly body?: string | null;
  @ApiPropertyOptional() @IsOptional() @IsUUID('4') readonly fileObjectId?: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID('4') readonly replyToMessageId?: string;
}
export class EditChatInput {
  @ApiProperty() @IsInt() @Min(1) @Max(2147483647) readonly expectedVersion!: number;
  @ApiProperty({ nullable: true })
  @ValidateIf((_object, value) => value !== null)
  @IsString()
  @MinLength(1)
  @MaxLength(4000)
  @Matches(/\S/u)
  readonly body!: string | null;
}
export class ChatUploadInput {
  @ApiProperty() @IsString() @MinLength(1) @MaxLength(250) readonly originalFilename!: string;
  @ApiProperty({ enum: ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'] })
  @IsIn(['image/jpeg', 'image/png', 'image/webp', 'application/pdf'])
  readonly declaredMimeType!: string;
  @ApiProperty() @IsInt() @Min(1) @Max(10485760) readonly declaredSizeBytes!: number;
}
export class DeleteChatQuery {
  @ApiProperty()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(2147483647)
  readonly expectedVersion!: number;
}
export class ReadChatInput {
  @ApiProperty({ example: '12' })
  @IsString()
  @Matches(/^(0|[1-9]\d{0,18})$/)
  readonly throughSequence!: string;
}
export class ChatEventQuery extends ChatPageQuery {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Matches(/^(0|[1-9]\d{0,18})$/)
  readonly afterSequence?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Matches(/^(0|[1-9]\d{0,18})$/)
  readonly throughSequence?: string;
}
export interface MessageDto {
  id: string;
  conversationId: string;
  sender: { id: string; displayName: string; avatarUrl: null };
  clientMessageId: string | null;
  sequence: string;
  lastChangedSequence: string;
  type: 'TEXT' | 'FILE' | 'IMAGE';
  body: string | null;
  file: {
    id: string;
    originalFilename: string;
    mimeType: string;
    sizeBytes: number;
    kind: 'IMAGE' | 'PDF';
  } | null;
  replyTo: { id: string; senderDisplayName: string; deleted: boolean } | null;
  version: number;
  createdAt: string;
  editedAt: string | null;
  deletedAt: string | null;
}
export interface ConversationDto {
  id: string;
  type: 'GROUP' | 'DIRECT';
  classId: string | null;
  name: string | null;
  peer: { id: string; displayName: string; avatarUrl: null } | null;
  capabilities: { canRead: true; canSend: boolean; canAttach: boolean; canType: boolean };
  accessMode: 'ACTIVE' | 'CASH_PENDING' | 'HISTORY_READ_ONLY';
  lastReadSequence: string;
  highWatermark: string;
  unreadCount: number;
  lastMessage: MessageDto | null;
  activityAt: string;
}
export interface ChatPage<T> {
  data: T[];
  meta: {
    nextCursor: string | null;
    hasMore: boolean;
    highWatermark?: string;
    throughSequence?: string;
  };
}
