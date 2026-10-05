import { Controller, Get, HttpStatus, Param, ParseUUIDPipe, UseGuards } from '@nestjs/common';
import { ApiCookieAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { ApiErrors } from '../../../decorators/api-errors.decorator.js';
import type { AuthenticatedUser } from '../../auth/auth.types.js';
import { CurrentUser } from '../../auth/decorators/current-user.decorator.js';
import { Roles } from '../../auth/decorators/roles.decorator.js';
import { AccessTokenGuard } from '../../auth/guards/access-token.guard.js';
import { RolesGuard } from '../../auth/guards/roles.guard.js';
import { UserRole } from '../../users/user-role.enum.js';
import { StudentClassDto } from '../dtos/student-class.dto.js';
// biome-ignore lint/style/useImportType: Nest DI requires runtime constructor.
import { StudentClassService } from '../services/student-class.service.js';

@ApiTags('student classes')
@ApiCookieAuth('access_token')
@UseGuards(AccessTokenGuard, RolesGuard)
@Roles(UserRole.STUDENT)
@ApiErrors(
  HttpStatus.UNAUTHORIZED,
  HttpStatus.FORBIDDEN,
  HttpStatus.NOT_FOUND,
  HttpStatus.UNPROCESSABLE_ENTITY,
)
@Controller('me/classes')
export class StudentClassesController {
  constructor(private readonly classes: StudentClassService) {}
  @Get(':classId')
  @ApiOkResponse({ type: StudentClassDto })
  async get(
    @CurrentUser() user: AuthenticatedUser,
    @Param('classId', new ParseUUIDPipe()) id: string,
  ): Promise<StudentClassDto> {
    return new StudentClassDto(await this.classes.get(user.userId, id));
  }
}
