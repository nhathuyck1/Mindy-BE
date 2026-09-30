import { ApiProperty } from '@nestjs/swagger';

export class RegistrationAcceptedDto {
  @ApiProperty({
    example: 'If the address can be registered, a verification email has been sent.',
  })
  readonly message = 'If the address can be registered, a verification email has been sent.';
}
