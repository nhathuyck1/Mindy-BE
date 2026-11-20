import {
  Body,
  Controller,
  Get,
  Header,
  Headers,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { RequestOriginGuard } from '../../common/guards/request-origin.guard.js';
import type { AuthenticatedUser } from '../auth/auth.types.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { AccessTokenGuard } from '../auth/guards/access-token.guard.js';
// biome-ignore lint/style/useImportType: Validation runtime classes.
import {
  BoardEpochInput,
  BoardPageQuery,
  ControlBoardInput,
  CreateBoardInput,
  ResetBoardInput,
  RestoreBoardInput,
} from './whiteboards.dto.js';
// biome-ignore lint/style/useImportType: Nest DI runtime token.
import { WhiteboardsService } from './whiteboards.service.js';

@ApiTags('Whiteboards')
@ApiCookieAuth('access_token')
@UseGuards(AccessTokenGuard, RequestOriginGuard)
@Controller('class-sessions')
export class SessionWhiteboardController {
  constructor(private readonly boards: WhiteboardsService) {}
  @Get(':sessionId/whiteboard')
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'Read whiteboard context without creating a board' })
  context(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('sessionId', new ParseUUIDPipe({ version: '4' })) id: string,
  ) {
    return this.boards.context(actor, id);
  }
  @Post(':sessionId/whiteboard')
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'Create one persistent board for an assigned session' })
  create(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('sessionId', new ParseUUIDPipe({ version: '4' })) id: string,
    @Headers('idempotency-key') key: string,
    @Body() input: CreateBoardInput,
  ) {
    return this.boards.create(actor, id, key, input);
  }
}

@ApiTags('Whiteboards')
@ApiCookieAuth('access_token')
@UseGuards(AccessTokenGuard, RequestOriginGuard)
@Controller('whiteboards')
export class WhiteboardsController {
  constructor(private readonly boards: WhiteboardsService) {}
  @Get(':boardId')
  @Header('Cache-Control', 'no-store')
  get(
    @CurrentUser() a: AuthenticatedUser,
    @Param('boardId', new ParseUUIDPipe({ version: '4' })) id: string,
  ) {
    return this.boards.get(a, id);
  }
  @Patch(':boardId/control')
  @Header('Cache-Control', 'no-store')
  control(
    @CurrentUser() a: AuthenticatedUser,
    @Param('boardId', new ParseUUIDPipe({ version: '4' })) id: string,
    @Headers('idempotency-key') key: string,
    @Body() input: ControlBoardInput,
  ) {
    return this.boards.control(a, id, key, input);
  }
  @Get(':boardId/snapshots')
  @Header('Cache-Control', 'no-store')
  list(
    @CurrentUser() a: AuthenticatedUser,
    @Param('boardId', new ParseUUIDPipe({ version: '4' })) id: string,
    @Query() q: BoardPageQuery,
  ) {
    return this.boards.snapshots(a, id, q);
  }
  @Post(':boardId/snapshots')
  @Header('Cache-Control', 'no-store')
  snapshot(
    @CurrentUser() a: AuthenticatedUser,
    @Param('boardId', new ParseUUIDPipe({ version: '4' })) id: string,
    @Headers('idempotency-key') key: string,
    @Body() input: BoardEpochInput,
  ) {
    return this.boards.snapshot(a, id, key, input.expectedEpoch);
  }
  @Get(':boardId/snapshots/:snapshotId')
  @Header('Cache-Control', 'no-store')
  preview(
    @CurrentUser() a: AuthenticatedUser,
    @Param('boardId', new ParseUUIDPipe({ version: '4' })) id: string,
    @Param('snapshotId', new ParseUUIDPipe({ version: '4' })) snapshotId: string,
  ) {
    return this.boards.preview(a, id, snapshotId);
  }
  @Post(':boardId/resets')
  @Header('Cache-Control', 'no-store')
  reset(
    @CurrentUser() a: AuthenticatedUser,
    @Param('boardId', new ParseUUIDPipe({ version: '4' })) id: string,
    @Headers('idempotency-key') key: string,
    @Body() input: ResetBoardInput,
  ) {
    return this.boards.reset(a, id, key, input);
  }
  @Post(':boardId/restores')
  @Header('Cache-Control', 'no-store')
  restore(
    @CurrentUser() a: AuthenticatedUser,
    @Param('boardId', new ParseUUIDPipe({ version: '4' })) id: string,
    @Headers('idempotency-key') key: string,
    @Body() input: RestoreBoardInput,
  ) {
    return this.boards.reset(a, id, key, input);
  }
}
