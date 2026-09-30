import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';
import type { IdentityProvider } from './user-identity.entity.js';

@Entity({ name: 'registration_intents' })
@Index('uq_registration_intents_token_hash', ['tokenHash'], { unique: true })
@Index('idx_registration_intents_provider_subject', ['provider', 'providerSubject'])
@Index('idx_registration_intents_expires_at', ['expiresAt'])
export class RegistrationIntentEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'provider', type: 'varchar', length: 32 })
  provider!: IdentityProvider;

  @Column({ name: 'provider_subject', type: 'varchar', length: 255 })
  providerSubject!: string;

  @Column({ name: 'verified_email', type: 'varchar', length: 320 })
  verifiedEmail!: string;

  @Column({ name: 'display_name_hint', type: 'varchar', length: 150, nullable: true })
  displayNameHint!: string | null;

  @Column({ name: 'avatar_url_hint', type: 'text', nullable: true })
  avatarUrlHint!: string | null;

  @Column({ name: 'token_hash', type: 'char', length: 64 })
  tokenHash!: string;

  @Column({ name: 'return_to', type: 'varchar', length: 500 })
  returnTo!: string;

  @Column({ name: 'expires_at', type: 'timestamptz' })
  expiresAt!: Date;

  @Column({ name: 'consumed_at', type: 'timestamptz', nullable: true })
  consumedAt!: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
