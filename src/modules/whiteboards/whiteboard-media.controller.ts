import {
  Body,
  Controller,
  Get,
  Header,
  Headers,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiCookieAuth, ApiTags } from '@nestjs/swagger';
import { RequestOriginGuard } from '../../common/guards/request-origin.guard.js';
import type { AuthenticatedUser } from '../auth/auth.types.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { AccessTokenGuard } from '../auth/guards/access-token.guard.js';
// biome-ignore lint/style/useImportType: Validation runtime classes.
import { BoardAssetInput, BoardExportInput } from './whiteboard-media.dto.js';
// biome-ignore lint/style/useImportType: Nest DI runtime token.
import { WhiteboardMediaService } from './whiteboard-media.service.js';

@ApiTags('Whiteboards')
@ApiCookieAuth('access_token')
@UseGuards(AccessTokenGuard, RequestOriginGuard)
@Controller('whiteboards/:boardId')
export class WhiteboardMediaController {
  constructor(private readonly media: WhiteboardMediaService) {}
  @Post('assets')
  @Header('Cache-Control', 'no-store')
  intent(
    @CurrentUser() a: AuthenticatedUser,
    @Param('boardId', new ParseUUIDPipe({ version: '4' })) id: string,
    @Headers('idempotency-key') key: string,
    @Body() input: BoardAssetInput,
  ) {
    return this.media.intent(a, id, key, input);
  }
  @Post('assets/:assetId/complete')
  @Header('Cache-Control', 'no-store')
  complete(
    @CurrentUser() a: AuthenticatedUser,
    @Param('boardId', new ParseUUIDPipe({ version: '4' })) id: string,
    @Param('assetId', new ParseUUIDPipe({ version: '4' })) assetId: string,
    @Headers('idempotency-key') key: string,
  ) {
    return this.media.complete(a, id, assetId, key);
  }
  @Get('assets/:assetId')
  @Header('Cache-Control', 'no-store')
  status(
    @CurrentUser() a: AuthenticatedUser,
    @Param('boardId', new ParseUUIDPipe({ version: '4' })) id: string,
    @Param('assetId', new ParseUUIDPipe({ version: '4' })) assetId: string,
  ) {
    return this.media.status(a, id, assetId);
  }
  @Post('assets/:assetId/access')
  @Header('Cache-Control', 'no-store')
  @HttpCode(200)
  access(
    @CurrentUser() a: AuthenticatedUser,
    @Param('boardId', new ParseUUIDPipe({ version: '4' })) id: string,
    @Param('assetId', new ParseUUIDPipe({ version: '4' })) assetId: string,
  ) {
    return this.media.access(a, id, assetId);
  }
  @Post('exports')
  @Header('Cache-Control', 'no-store')
  @HttpCode(202)
  export(
    @CurrentUser() a: AuthenticatedUser,
    @Param('boardId', new ParseUUIDPipe({ version: '4' })) id: string,
    @Headers('idempotency-key') key: string,
    @Body() input: BoardExportInput,
  ) {
    return this.media.export(a, id, key, input);
  }
  @Get('exports/:exportId')
  @Header('Cache-Control', 'no-store')
  exportStatus(
    @CurrentUser() a: AuthenticatedUser,
    @Param('boardId', new ParseUUIDPipe({ version: '4' })) id: string,
    @Param('exportId', new ParseUUIDPipe({ version: '4' })) exportId: string,
  ) {
    return this.media.exportStatus(a, id, exportId);
  }
  @Post('exports/:exportId/access')
  @Header('Cache-Control', 'no-store')
  @HttpCode(200)
  download(
    @CurrentUser() a: AuthenticatedUser,
    @Param('boardId', new ParseUUIDPipe({ version: '4' })) id: string,
    @Param('exportId', new ParseUUIDPipe({ version: '4' })) exportId: string,
  ) {
    return this.media.exportStatus(a, id, exportId, true);
  }
}
