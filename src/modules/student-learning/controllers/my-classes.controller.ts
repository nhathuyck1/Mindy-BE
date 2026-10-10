import { Controller, Get, Header, HttpStatus, Query, UseGuards } from '@nestjs/common';
import { ApiCookieAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';

import { ApiErrors } from '../../../decorators/api-errors.decorator.js';
import type { AuthenticatedUser } from '../../auth/auth.types.js';
import { CurrentUser } from '../../auth/decorators/current-user.decorator.js';
import { Roles } from '../../auth/decorators/roles.decorator.js';
import { AccessTokenGuard } from '../../auth/guards/access-token.guard.js';
import { RolesGuard } from '../../auth/guards/roles.guard.js';
import { UserRole } from '../../users/user-role.enum.js';
import { MyClassDto, MyClassPageDto } from '../dtos/my-class.dto.js';
// biome-ignore lint/style/useImportType: Nest query validation needs runtime DTO metadata.
import { MyClassPageOptionsDto } from '../dtos/my-class-page-options.dto.js';
// biome-ignore lint/style/useImportType: Nest dependency injection needs runtime constructor tokens.
import { MyClassesService } from '../services/my-classes.service.js';

@ApiTags('student classes')
@ApiCookieAuth('access_token')
@UseGuards(AccessTokenGuard, RolesGuard)
@Roles(UserRole.STUDENT)
@ApiErrors(HttpStatus.UNAUTHORIZED, HttpStatus.FORBIDDEN, HttpStatus.UNPROCESSABLE_ENTITY)
@Controller('me/classes')
export class MyClassesController {
  constructor(private readonly myClasses: MyClassesService) {}

  @Get()
  @Header('Cache-Control', 'private, no-store')
  @ApiOperation({
    summary: "List the signed-in student's enrollments with order summary and access hints",
    description:
      'One row per enrollment, newest first. accessMode tells which class endpoint to open; ' +
      'detail/preview endpoints re-check access. No meeting URL, QR or checkout URL.',
  })
  @ApiOkResponse({ type: MyClassPageDto })
  async list(
    @CurrentUser() user: AuthenticatedUser,
    @Query() options: MyClassPageOptionsDto,
  ): Promise<MyClassPageDto> {
    const result = await this.myClasses.list(user.userId, options);
    return new MyClassPageDto(
      result.items.map((item) => new MyClassDto(item)),
      options.page,
      options.pageSize,
      result.total,
      result.asOf,
    );
  }
}
