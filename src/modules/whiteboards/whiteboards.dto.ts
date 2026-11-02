import { Transform, Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class CreateBoardInput {
  @IsOptional()
  @IsString()
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  @MinLength(1)
  @MaxLength(250)
  title?: string;
}
export class ControlBoardInput extends CreateBoardInput {
  @IsString() @Matches(/^[1-9]\d{0,17}$/) expectedControlVersion!: string;
  @IsOptional() @IsIn(['PRESENTATION', 'COLLABORATIVE']) mode?: 'PRESENTATION' | 'COLLABORATIVE';
}
export class BoardEpochInput {
  @IsUUID('4') expectedEpoch!: string;
}
export class ResetBoardInput extends BoardEpochInput {
  @IsString() @Matches(/^\d{1,18}$/) expectedSequence!: string;
  @IsString() @Matches(/^[1-9]\d{0,17}$/) expectedControlVersion!: string;
}
export class RestoreBoardInput extends ResetBoardInput {
  @IsUUID('4') snapshotId!: string;
}
export class BoardPageQuery {
  @Type(() => Number) @IsInt() @Min(1) page = 1;
  @Type(() => Number) @IsInt() @Min(1) @Max(50) pageSize = 20;
}
