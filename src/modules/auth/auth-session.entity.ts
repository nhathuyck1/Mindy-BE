import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';
import { AuthenticationMethod } from './authentication-method.enum.js';

@Entity({ name: 'auth_sessions' })
@Index('idx_auth_sessions_user_revoked', ['userId', 'revokedAt'])
@Index('idx_auth_sessions_expires_at', ['expiresAt'])
@Index('idx_auth_sessions_identity_id', ['identityId'])
export class AuthSessionEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId!: string;

  @Column({ name: 'identity_id', type: 'uuid', nullable: true })
  identityId!: string | null;

  @Column({
    name: 'authentication_method',
    type: 'varchar',
    length: 32,
    default: AuthenticationMethod.PASSWORD,
  })
  authenticationMethod!: AuthenticationMethod;

  @Column({ name: 'device_name', type: 'varchar', length: 150, nullable: true })
  deviceName!: string | null;

  @Column({ name: 'user_agent', type: 'text', nullable: true })
  userAgent!: string | null;

  @Column({ name: 'ip_address', type: 'inet', nullable: true })
  ipAddress!: string | null;

  @Column({ name: 'last_seen_at', type: 'timestamptz', nullable: true })
  lastSeenAt!: Date | null;

  @Column({ name: 'expires_at', type: 'timestamptz' })
  expiresAt!: Date;

  @Column({ name: 'revoked_at', type: 'timestamptz', nullable: true })
  revokedAt!: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
