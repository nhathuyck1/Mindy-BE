import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsUrl, MaxLength, Min, ValidateIf } from 'class-validator';
import { MEETING_URL_OPTIONS } from './create-class.dto.js';

export class UpdateSessionMeetingDto {
  @ApiProperty({
    type: String,
    format: 'uri',
    nullable: true,
    maxLength: 2048,
    description: 'Session meeting URL; null clears the override and uses the class URL.',
  })
  @ValidateIf((_object, value) => value !== null)
  @IsUrl({ ...MEETING_URL_OPTIONS, require_valid_protocol: true, disallow_auth: true })
  @MaxLength(2048)
  readonly meetingUrl!: string | null;

  @ApiProperty({ type: Number, minimum: 1 })
  @IsInt()
  @Min(1)
  readonly expectedVersion!: number;
}

export class SessionMeetingDto {
  @ApiProperty({ format: 'uuid' }) readonly sessionId!: string;
  @ApiProperty({ format: 'uuid' }) readonly classId!: string;
  @ApiProperty({ type: String, format: 'uri', nullable: true }) readonly meetingUrl!: string | null;
  @ApiProperty({ type: String, format: 'uri', nullable: true }) readonly effectiveMeetingUrl!:
    | string
    | null;
  @ApiProperty() readonly version!: number;
}
