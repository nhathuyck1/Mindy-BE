import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

export class BoardAssetInput {
  @IsString() @MinLength(1) @MaxLength(250) filename!: string;
  @IsIn(['image/png', 'image/jpeg', 'application/pdf']) mimeType!:
    | 'image/png'
    | 'image/jpeg'
    | 'application/pdf';
  @IsInt() @Min(1) @Max(10485760) sizeBytes!: number;
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(10)
  @ArrayUnique()
  @IsInt({ each: true })
  @Min(1, { each: true })
  @Max(100, { each: true })
  pages?: number[];
}
export class BoardViewportInput {
  @IsNumber() @Min(-100000) @Max(100000) x!: number;
  @IsNumber() @Min(-100000) @Max(100000) y!: number;
  @IsNumber() @Min(1) @Max(10000) width!: number;
  @IsNumber() @Min(1) @Max(10000) height!: number;
  @IsNumber() @Min(0.1) @Max(4) scale!: number;
}
export class BoardExportInput {
  @IsUUID('4') expectedEpoch!: string;
  @IsIn(['PNG', 'PDF']) format!: 'PNG' | 'PDF';
  @IsIn(['VIEWPORT', 'CONTENT']) scope!: 'VIEWPORT' | 'CONTENT';
  @IsOptional() @Type(() => BoardViewportInput) @ValidateNested() viewport?: BoardViewportInput;
}
