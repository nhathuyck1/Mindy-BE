import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

/** The price is never accepted from the client; the server records the current course price. */
export class AddCartItemDto {
  @ApiProperty({ type: String, format: 'uuid', description: 'An OPEN class' })
  @IsUUID('4')
  readonly classId!: string;
}
