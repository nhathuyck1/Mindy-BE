import { ApiProperty } from '@nestjs/swagger';

import { UserDto } from './user.dto.js';

export class UserPageDto {
  @ApiProperty({ type: () => UserDto, isArray: true })
  readonly items: UserDto[];

  @ApiProperty({ type: Number, example: 1 })
  readonly page: number;

  @ApiProperty({ type: Number, example: 20 })
  readonly pageSize: number;

  @ApiProperty({ type: Number, example: 42 })
  readonly total: number;

  constructor(items: UserDto[], page: number, pageSize: number, total: number) {
    this.items = items;
    this.page = page;
    this.pageSize = pageSize;
    this.total = total;
  }
}
