import { OmitType } from '@nestjs/swagger';
import {
  CreateManagerMaterialDto,
  ManagerMaterialQueryDto,
  PatchManagerMaterialDto,
} from './manager-material-input.dto.js';

export class CreateMentorMaterialDto extends CreateManagerMaterialDto {}
export class PatchMentorMaterialDto extends PatchManagerMaterialDto {}
export class MentorMaterialQueryDto extends OmitType(ManagerMaterialQueryDto, [
  'courseUnitId',
] as const) {}
