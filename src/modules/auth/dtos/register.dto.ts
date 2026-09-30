import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import {
  IsEmail,
  IsOptional,
  IsString,
  Length,
  Matches,
  MaxLength,
} from "class-validator";

export class RegisterDto {
  @ApiProperty({
    type: String,
    format: "email",
    example: "student@example.com",
  })
  @IsEmail()
  @MaxLength(320)
  readonly email!: string;

  @ApiProperty({
    type: String,
    format: "password",
    minLength: 6,
    maxLength: 128,
  })
  @IsString()
  @Length(6, 128)
  readonly password!: string;

  @ApiProperty({
    type: String,
    example: "Nguyen Van A",
    minLength: 1,
    maxLength: 150,
  })
  @IsString()
  @Length(1, 150)
  @Matches(/\S/, {
    message: "displayName must contain at least one non-space character",
  })
  readonly displayName!: string;

  @ApiPropertyOptional({
    type: String,
    example: "0901234567",
    minLength: 7,
    maxLength: 32,
  })
  @IsOptional()
  @IsString()
  @Length(7, 32)
  readonly phone?: string;
}
