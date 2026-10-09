import {
  Body,
  Controller,
  Get,
  Header,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Res,
  UseGuards,
} from '@nestjs/common';
import {
  ApiAcceptedResponse,
  ApiCookieAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';

interface FileResponse {
  status(code: number): unknown;
}

import { ApiErrors } from '../../../decorators/api-errors.decorator.js';
import type { AuthenticatedUser } from '../../auth/auth.types.js';
import { CurrentUser } from '../../auth/decorators/current-user.decorator.js';
import { Roles } from '../../auth/decorators/roles.decorator.js';
import { AccessTokenGuard } from '../../auth/guards/access-token.guard.js';
import { RolesGuard } from '../../auth/guards/roles.guard.js';
import { UserRole } from '../../users/user-role.enum.js';
// biome-ignore lint/style/useImportType: Runtime DTO metadata.
import { CompleteUploadDto } from '../dtos/complete-upload.dto.js';
// biome-ignore lint/style/useImportType: Runtime DTO metadata.
import { CreateUploadIntentDto } from '../dtos/create-upload-intent.dto.js';
import { FileStatusDto, UploadIntentDto } from '../dtos/file-status.dto.js';
// biome-ignore lint/style/useImportType: Nest DI needs runtime constructor.
import { FilesService } from '../services/files.service.js';
@ApiTags('files')
@ApiCookieAuth('access_token')
@Controller('files')
@UseGuards(AccessTokenGuard, RolesGuard)
@Roles(UserRole.MANAGER, UserRole.MENTOR)
@ApiErrors(401, 403, 404, 409, 422, 429, 503)
export class FilesController {
  constructor(private readonly files: FilesService) {}
  @Post('upload-intents')
  @Header('Cache-Control', 'no-store')
  @ApiCreatedResponse({ type: UploadIntentDto })
  @ApiOperation({
    summary: 'Create a private Course Unit upload intent for Manager or assigned Mentor',
  })
  create(
    @CurrentUser() principal: AuthenticatedUser,
    @Body() input: CreateUploadIntentDto,
  ): Promise<UploadIntentDto> {
    return this.files.createIntent(principal, input);
  }
  @Get(':fileId')
  @Header('Cache-Control', 'no-store')
  @ApiOkResponse({ type: FileStatusDto })
  @ApiOperation({
    summary: 'Read upload validation status with current ownership and assignment checks',
  })
  detail(
    @CurrentUser() principal: AuthenticatedUser,
    @Param(
      'fileId',
      new ParseUUIDPipe({ version: '4', errorHttpStatusCode: HttpStatus.UNPROCESSABLE_ENTITY }),
    )
    id: string,
  ): Promise<FileStatusDto> {
    return this.files.detail(principal, id);
  }
  @Post(':fileId/complete')
  @Header('Cache-Control', 'no-store')
  @ApiAcceptedResponse({ type: FileStatusDto })
  @ApiOperation({
    summary: 'Complete an upload and enqueue validation once; READY retries return 200',
  })
  @ApiOkResponse({ type: FileStatusDto })
  async complete(
    @CurrentUser() principal: AuthenticatedUser,
    @Body() _input: CompleteUploadDto,
    @Param(
      'fileId',
      new ParseUUIDPipe({ version: '4', errorHttpStatusCode: HttpStatus.UNPROCESSABLE_ENTITY }),
    )
    id: string,
    @Res({ passthrough: true }) response: FileResponse,
  ): Promise<FileStatusDto> {
    const result = await this.files.complete(principal, id);
    response.status(result.httpStatus);
    return result.file;
  }
}
