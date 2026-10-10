import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module.js';
import { CatalogModule } from '../catalog/catalog.module.js';
import { ClassesModule } from '../classes/classes.module.js';
import { UsersModule } from '../users/users.module.js';
import { FilesController } from './controllers/files.controller.js';
import { FileMetadataEntity } from './entities/file-metadata.entity.js';
import { FileObjectEntity } from './entities/file-object.entity.js';
import { FileProcessingJobEntity } from './entities/file-processing-job.entity.js';
import { FILE_STORAGE } from './files.contracts.js';
import { BINARY_VALIDATOR, BinaryValidationService } from './services/binary-validation.service.js';
import { FileProcessingService } from './services/file-processing.service.js';
import { FileProcessingWorker } from './services/file-processing.worker.js';
import { FileUploadPolicyService } from './services/file-upload-policy.service.js';
import { FilesService } from './services/files.service.js';
import { MinioFileStorage } from './storage/minio-file-storage.js';
@Module({
  imports: [
    AuthModule,
    UsersModule,
    CatalogModule,
    ClassesModule,
    TypeOrmModule.forFeature([FileObjectEntity, FileMetadataEntity, FileProcessingJobEntity]),
  ],
  controllers: [FilesController],
  providers: [
    FileUploadPolicyService,
    FilesService,
    FileProcessingService,
    FileProcessingWorker,
    MinioFileStorage,
    BinaryValidationService,
    { provide: FILE_STORAGE, useExisting: MinioFileStorage },
    { provide: BINARY_VALIDATOR, useExisting: BinaryValidationService },
  ],
  exports: [FileUploadPolicyService, FilesService],
})
export class FilesModule {}
