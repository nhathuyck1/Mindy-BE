import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiCookieAuth, ApiNoContentResponse, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { RequestOriginGuard } from '../../../common/guards/request-origin.guard.js';
import { ApiErrors } from '../../../decorators/api-errors.decorator.js';
import type { AuthenticatedUser } from '../../auth/auth.types.js';
import { CurrentUser } from '../../auth/decorators/current-user.decorator.js';
import { Roles } from '../../auth/decorators/roles.decorator.js';
import { AccessTokenGuard } from '../../auth/guards/access-token.guard.js';
import { RolesGuard } from '../../auth/guards/roles.guard.js';
import { UserRole } from '../../users/user-role.enum.js';
// biome-ignore lint/style/useImportType: Runtime request validation metadata.
import {
  MaterialBulkDeleteInput,
  MaterialBulkDeleteResponseDto,
  MaterialCleanupStatsDto,
  MaterialOpenInput,
} from '../dtos/material-retention.dto.js';
// biome-ignore lint/style/useImportType: Nest DI runtime token.
import { MaterialRetentionService } from '../services/material-retention.service.js';

@ApiTags('material-retention')
@ApiCookieAuth('access_token')
@ApiErrors(401, 403, 404, 409, 422)
@UseGuards(AccessTokenGuard, RolesGuard, RequestOriginGuard)
@Controller()
export class MaterialRetentionController {
  constructor(private readonly retention: MaterialRetentionService) {}
  @Get('manager/materials/storage-cleanup')
  @Roles(UserRole.MANAGER)
  @ApiOkResponse({ type: MaterialCleanupStatsDto })
  stats(@CurrentUser() actor: AuthenticatedUser): Promise<MaterialCleanupStatsDto> {
    return this.retention.cleanupStats(actor);
  }
  @Post('materials/:materialId/open')
  @HttpCode(204)
  @Roles(UserRole.STUDENT, UserRole.MENTOR)
  @ApiNoContentResponse()
  opened(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('materialId', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() input: MaterialOpenInput,
  ): Promise<void> {
    return this.retention.opened(actor, id, input);
  }
  @Post('manager/materials/bulk-delete')
  @HttpCode(200)
  @Roles(UserRole.MANAGER)
  @ApiOkResponse({ type: MaterialBulkDeleteResponseDto })
  bulkDelete(
    @CurrentUser() actor: AuthenticatedUser,
    @Body() input: MaterialBulkDeleteInput,
  ): Promise<MaterialBulkDeleteResponseDto> {
    return this.retention.bulkDelete(actor, input);
  }
}
