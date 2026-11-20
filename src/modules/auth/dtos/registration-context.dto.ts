import { ApiProperty } from '@nestjs/swagger';

export class RegistrationContextDto {
  @ApiProperty({ type: String, format: 'email', readOnly: true })
  readonly email: string;

  @ApiProperty({ type: String, nullable: true })
  readonly displayName: string | null;

  @ApiProperty({ type: String, format: 'uri', nullable: true, readOnly: true })
  readonly avatarUrl: string | null;

  @ApiProperty({ type: String, format: 'date-time' })
  readonly expiresAt: Date;

  constructor(input: {
    email: string;
    displayName: string | null;
    avatarUrl: string | null;
    expiresAt: Date;
  }) {
    this.email = input.email;
    this.displayName = input.displayName;
    this.avatarUrl = input.avatarUrl;
    this.expiresAt = input.expiresAt;
  }
}
