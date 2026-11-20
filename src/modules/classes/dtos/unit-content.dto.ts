import { ApiProperty } from '@nestjs/swagger';
import { ClassUnitManagementDto } from './class.dto.js';

export class MentorContentUnitPageDto {
  @ApiProperty({ type: () => [ClassUnitManagementDto] }) readonly items: ClassUnitManagementDto[];
  @ApiProperty() readonly page: number;
  @ApiProperty() readonly pageSize: number;
  @ApiProperty() readonly total: number;
  constructor(items: ClassUnitManagementDto[], page: number, pageSize: number, total: number) {
    this.items = items;
    this.page = page;
    this.pageSize = pageSize;
    this.total = total;
  }
}
