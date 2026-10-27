import { applyDecorators, Header } from '@nestjs/common';
import { ApiHeader, ApiResponse, type SchemaObject } from '@nestjs/swagger';
import { ApiErrors } from '../../../decorators/api-errors.decorator.js';

const uuid: SchemaObject = { type: 'string', format: 'uuid' },
  sequence: SchemaObject = { type: 'string', pattern: '^(0|[1-9][0-9]*)$' };
const time: SchemaObject = { type: 'string', format: 'date-time' },
  nullableTime: SchemaObject = { ...time, nullable: true };
const person: SchemaObject = {
  type: 'object',
  properties: {
    id: uuid,
    displayName: { type: 'string' },
    avatarUrl: { type: 'string', nullable: true },
  },
};
const file: SchemaObject = {
  type: 'object',
  nullable: true,
  properties: {
    id: uuid,
    originalFilename: { type: 'string' },
    mimeType: { type: 'string' },
    sizeBytes: { type: 'integer' },
    kind: { type: 'string', enum: ['IMAGE', 'PDF'] },
  },
};
const message: SchemaObject = {
  type: 'object',
  required: ['id', 'conversationId', 'sender', 'sequence', 'version', 'body', 'file'],
  properties: {
    id: uuid,
    conversationId: uuid,
    sender: person,
    clientMessageId: { ...uuid, nullable: true },
    sequence,
    lastChangedSequence: sequence,
    type: { type: 'string', enum: ['TEXT', 'FILE', 'IMAGE'] },
    body: { type: 'string', nullable: true },
    file,
    replyTo: {
      type: 'object',
      nullable: true,
      properties: { id: uuid, senderDisplayName: { type: 'string' }, deleted: { type: 'boolean' } },
    },
    version: { type: 'integer' },
    createdAt: time,
    editedAt: nullableTime,
    deletedAt: nullableTime,
  },
};
const conversation: SchemaObject = {
  type: 'object',
  properties: {
    id: uuid,
    type: { type: 'string', enum: ['GROUP', 'DIRECT'] },
    classId: { ...uuid, nullable: true },
    name: { type: 'string', nullable: true },
    peer: { ...person, nullable: true },
    capabilities: {
      type: 'object',
      properties: {
        canRead: { type: 'boolean' },
        canSend: { type: 'boolean' },
        canAttach: { type: 'boolean' },
        canType: { type: 'boolean' },
      },
    },
    accessMode: { type: 'string', enum: ['ACTIVE', 'CASH_PENDING', 'HISTORY_READ_ONLY'] },
    lastReadSequence: sequence,
    highWatermark: sequence,
    unreadCount: { type: 'integer' },
    lastMessage: { ...message, nullable: true },
    activityAt: time,
  },
};
const notification: SchemaObject = {
  type: 'object',
  properties: {
    id: uuid,
    type: { type: 'string', enum: ['CHAT_MESSAGE'] },
    actorId: uuid,
    conversationId: uuid,
    messageId: uuid,
    title: { type: 'string' },
    body: { type: 'string' },
    data: { type: 'object', properties: { conversationId: uuid, messageId: uuid } },
    readAt: nullableTime,
    createdAt: time,
  },
};
const page = (item: SchemaObject): SchemaObject => ({
  type: 'object',
  properties: {
    data: { type: 'array', items: item },
    meta: {
      type: 'object',
      properties: {
        nextCursor: { type: 'string', nullable: true },
        hasMore: { type: 'boolean' },
        highWatermark: sequence,
        throughSequence: sequence,
      },
    },
  },
});
const status: SchemaObject = {
  type: 'object',
  properties: {
    id: uuid,
    status: {
      type: 'string',
      enum: ['PENDING_UPLOAD', 'PROCESSING', 'READY', 'FAILED', 'DELETING', 'DELETED'],
    },
    originalFilename: { type: 'string' },
    errorCode: { type: 'string', nullable: true },
    file,
  },
};
const schemas: Record<string, SchemaObject> = {
  conversation,
  conversations: page(conversation),
  messages: page(message),
  mutation: { type: 'object', properties: { message, replayed: { type: 'boolean' } } },
  direct: { type: 'object', properties: { conversation, created: { type: 'boolean' } } },
  members: page({
    type: 'object',
    properties: {
      userId: uuid,
      displayName: { type: 'string' },
      avatarUrl: { type: 'string', nullable: true },
      role: { type: 'string', enum: ['ADMIN', 'MEMBER'] },
      joinedAt: time,
      lastReadSequence: sequence,
    },
  }),
  read: {
    type: 'object',
    properties: {
      conversationId: uuid,
      lastReadSequence: sequence,
      lastReadAt: nullableTime,
      unreadCount: { type: 'integer' },
    },
  },
  events: page({
    type: 'object',
    properties: {
      eventId: uuid,
      conversationId: uuid,
      sequence,
      type: { type: 'string' },
      message: { ...message, nullable: true },
      occurredAt: time,
    },
  }),
  notifications: page(notification),
  notification,
  count: { type: 'object', properties: { unreadCount: { type: 'integer' } } },
  readAll: { type: 'object', properties: { readAt: time, resyncRequired: { type: 'boolean' } } },
  status,
  intent: {
    type: 'object',
    properties: {
      fileId: uuid,
      uploadUrl: { type: 'string' },
      requiredHeaders: { type: 'object', additionalProperties: { type: 'string' } },
      uploadUrlExpiresAt: time,
      intentExpiresAt: time,
      replayed: { type: 'boolean' },
    },
  },
  fileAccess: { type: 'object', properties: { url: { type: 'string' }, expiresAt: time } },
};
export function ApiChat(kind: keyof typeof schemas, statusCode = 200): MethodDecorator {
  return applyDecorators(
    Header('Cache-Control', 'no-store'),
    ...(kind === 'intent' || (kind === 'mutation' && statusCode === 200)
      ? [
          ApiHeader({
            name: 'Idempotency-Key',
            required: true,
            schema: { type: 'string', format: 'uuid' },
          }),
        ]
      : []),
    ApiResponse({ status: statusCode, schema: schemas[kind] }),
    ...(statusCode !== 200 && ['direct', 'intent', 'status'].includes(kind)
      ? [ApiResponse({ status: 200, schema: schemas[kind] })]
      : []),
    ApiErrors(400, 401, 403, 404, 409, 410, 413, 422, 429, 503),
  );
}
