import { Entity, PrimaryColumn } from 'typeorm';

export enum MaterialReferenceRole {
  INLINE_IMAGE = 'INLINE_IMAGE',
  ATTACHMENT = 'ATTACHMENT',
}

@Entity('material_file_references')
export class MaterialFileReferenceEntity {
  @PrimaryColumn({ name: 'material_id', type: 'uuid' }) materialId!: string;
  @PrimaryColumn({ name: 'file_id', type: 'uuid' }) fileId!: string;
  @PrimaryColumn({ type: 'varchar', length: 20 }) role!: MaterialReferenceRole;
}
