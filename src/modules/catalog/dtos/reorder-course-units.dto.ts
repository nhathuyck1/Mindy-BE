import { ApiProperty } from '@nestjs/swagger';
import { ArrayMaxSize, ArrayMinSize, ArrayUnique, IsArray, IsUUID } from 'class-validator';

export class ReorderCourseUnitsDto {
  @ApiProperty({
    type: String,
    format: 'uuid',
    isArray: true,
    description: 'Every unit of the course exactly once, in the new order',
  })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(200)
  @ArrayUnique()
  @IsUUID('4', { each: true })
  readonly unitIds!: string[];
}
