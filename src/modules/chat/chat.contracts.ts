import type { UserRole } from '../users/user-role.enum.js';

export type ChatMode = 'NONE' | 'READ' | 'WRITE';
export interface ChatPrincipal {
  readonly userId: string;
  readonly role: UserRole;
  readonly active: boolean;
}
export interface ChatRelation {
  readonly classId: string;
  readonly mentorId: string;
  readonly classStatus: string;
  readonly studentId: string;
  readonly enrollmentStatus: string;
  readonly paymentType: string | null;
  readonly orderStatus: string | null;
  readonly expiresAt: Date | null;
}
export interface ChatEntitlement {
  readonly mode: ChatMode;
  readonly history: 'CURRENT_JOIN' | 'PAIR';
}
export interface ChatIdentity {
  readonly messageId: string;
  readonly conversationId: string;
  readonly senderId: string;
}
export interface EncryptedChatBody {
  readonly ciphertext: Buffer;
  readonly iv: Buffer;
  readonly tag: Buffer;
  readonly keyVersion: number;
  readonly cryptoVersion: number;
}
export const CHAT_LIMITS = {
  textCharacters: 4000,
  textBytes: 16384,
  packetBytes: 32768,
  socketsPerUser: 5,
  subscriptionsPerSocket: 20,
  editWindowMs: 15 * 60 * 1000,
} as const;
