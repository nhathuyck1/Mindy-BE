import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, Matches, MaxLength } from 'class-validator';

export class GoogleLoginQueryDto {
  @ApiPropertyOptional({ type: String, example: '/dashboard', default: '/' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  @Matches(/^\/(?!\/)/, { message: 'returnTo must be an application-relative path' })
  readonly returnTo?: string;
}
