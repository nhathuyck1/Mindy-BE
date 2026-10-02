import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiCookieAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { AccessTokenGuard } from '../auth/guards/access-token.guard.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
// biome-ignore lint/style/useImportType: Nest dependency injection needs runtime constructor tokens.
import { PasswordService } from '../auth/services/password.service.js';
// biome-ignore lint/style/useImportType: Nest request validation needs runtime DTO metadata.
import { CreateUserDto } from './dtos/create-user.dto.js';
// biome-ignore lint/style/useImportType: Nest request validation needs runtime DTO metadata.
import { UpdateUserStatusDto } from './dtos/update-user-status.dto.js';
import { UserDto } from './dtos/user.dto.js';
import { UserPageDto } from './dtos/user-page.dto.js';
// biome-ignore lint/style/useImportType: Nest request validation needs runtime DTO metadata.
import { UserPageOptionsDto } from './dtos/user-page-options.dto.js';
import { UserRole } from './user-role.enum.js';
// biome-ignore lint/style/useImportType: Nest dependency injection needs runtime constructor tokens.
import { UsersService } from './users.service.js';

@ApiTags('admin-users')
@Controller('admin/users')
@UseGuards(AccessTokenGuard, RolesGuard)
@Roles(UserRole.ADMIN)
@ApiCookieAuth('access_token')
export class UsersController {
  constructor(
    private readonly usersService: UsersService,
    private readonly passwordService: PasswordService,
  ) {}

  @Post()
  @ApiOperation({ summary: 'Create a managed user account' })
  @ApiCreatedResponse({ type: UserDto })
  async create(@Body() dto: CreateUserDto): Promise<UserDto> {
    const passwordHash = await this.passwordService.hashPassword(dto.password);
    const user = await this.usersService.createUser(dto, passwordHash);
    return new UserDto(user);
  }

  @Get()
  @ApiOperation({ summary: 'List users' })
  @ApiOkResponse({ type: UserPageDto })
  async list(@Query() options: UserPageOptionsDto): Promise<UserPageDto> {
    const result = await this.usersService.listUsers(options);
    return new UserPageDto(
      result.items.map((user) => new UserDto(user)),
      options.page,
      options.pageSize,
      result.total,
    );
  }

  @Get(':userId')
  @ApiOperation({ summary: 'Get a user' })
  @ApiOkResponse({ type: UserDto })
  async get(@Param('userId', new ParseUUIDPipe()) userId: string): Promise<UserDto> {
    return new UserDto(await this.usersService.findById(userId));
  }

  @Patch(':userId/status')
  @ApiOperation({ summary: 'Suspend or reactivate a user' })
  @ApiOkResponse({ type: UserDto })
  async updateStatus(
    @Param('userId', new ParseUUIDPipe()) userId: string,
    @Body() dto: UpdateUserStatusDto,
  ): Promise<UserDto> {
    return new UserDto(await this.usersService.updateStatus(userId, dto.status));
  }
}
