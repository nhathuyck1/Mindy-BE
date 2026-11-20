import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

export enum IdentityProvider {
  GOOGLE = 'GOOGLE',
}

@Entity({ name: 'user_identities' })
@Index('uq_user_identities_provider_subject', ['provider', 'providerSubject'], { unique: true })
@Index('uq_user_identities_user_provider', ['userId', 'provider'], { unique: true })
@Index('idx_user_identities_user_id', ['userId'])
export class UserIdentityEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId!: string;

  @Column({ name: 'provider', type: 'varchar', length: 32 })
  provider!: IdentityProvider;

  @Column({ name: 'provider_subject', type: 'varchar', length: 255 })
  providerSubject!: string;

  @Column({ name: 'email_at_link', type: 'varchar', length: 320 })
  emailAtLink!: string;

  @Column({ name: 'email_verified', type: 'boolean' })
  emailVerified!: boolean;

  @Column({ name: 'last_login_at', type: 'timestamptz', nullable: true })
  lastLoginAt!: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
