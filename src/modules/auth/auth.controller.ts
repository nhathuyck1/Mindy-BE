import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
// biome-ignore lint/style/useImportType: Nest dependency injection needs runtime constructor tokens.
import { ConfigService } from '@nestjs/config';
import {
  ApiBody,
  ApiCookieAuth,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';

import { UserDto } from '../users/dtos/user.dto.js';
// biome-ignore lint/style/useImportType: Nest dependency injection needs runtime constructor tokens.
import { UsersService } from '../users/users.service.js';
// biome-ignore lint/style/useImportType: Nest dependency injection needs runtime constructor tokens.
import { AuthService } from './auth.service.js';
import type { AuthenticatedUser, AuthenticationContext, AuthTokens } from './auth.types.js';
import { ACCESS_TOKEN_COOKIE, REFRESH_TOKEN_COOKIE } from './constants.js';
import { CurrentUser } from './decorators/current-user.decorator.js';
import { AuthenticatedUserDto } from './dtos/authenticated-user.dto.js';
import { LoginDto } from './dtos/login.dto.js';
import { InvalidRefreshTokenException } from './exceptions/auth.exceptions.js';
import { AccessTokenGuard } from './guards/access-token.guard.js';
// biome-ignore lint/style/useImportType: Nest dependency injection needs runtime constructor tokens.
import { TokenService } from './services/token.service.js';

type RequestWithCookies = {
  cookies?: Record<string, string | undefined>;
  get(name: string): string | undefined;
  ip?: string;
};

type RequestLike = RequestWithCookies;

type ResponseLike = {
  cookie(name: string, value: string, options: Record<string, unknown>): void;
  clearCookie(name: string, options: Record<string, unknown>): void;
};

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly usersService: UsersService,
    private readonly config: ConfigService,
    private readonly tokenService: TokenService,
  ) {}

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Login with email and password' })
  @ApiBody({ type: LoginDto })
  @ApiOkResponse({ type: AuthenticatedUserDto })
  @ApiUnauthorizedResponse({ description: 'Invalid credentials' })
  async login(
    @Body() dto: LoginDto,
    @Req() request: RequestLike,
    @Res({ passthrough: true }) response: ResponseLike,
  ): Promise<AuthenticatedUserDto> {
    const result = await this.authService.login(dto, this.context(request, dto.deviceName));
    this.setAuthCookies(response, result.tokens);
    const user = await this.usersService.findById(result.userId);
    return new AuthenticatedUserDto(new UserDto(user), result.tokens.accessTokenExpiresAt);
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiCookieAuth('refresh_token')
  @ApiOperation({ summary: 'Rotate the current refresh token' })
  @ApiOkResponse({ type: AuthenticatedUserDto })
  @ApiUnauthorizedResponse({ description: 'Invalid refresh token' })
  async refresh(
    @Req() request: RequestWithCookies,
    @Res({ passthrough: true }) response: ResponseLike,
  ): Promise<AuthenticatedUserDto> {
    const rawRefreshToken = request.cookies?.[REFRESH_TOKEN_COOKIE];
    if (rawRefreshToken === undefined || rawRefreshToken.length === 0) {
      this.clearAuthCookies(response);
      throw new InvalidRefreshTokenException();
    }

    let tokens: AuthTokens;
    try {
      tokens = await this.authService.refresh(rawRefreshToken, this.context(request, null));
    } catch (error: unknown) {
      if (error instanceof InvalidRefreshTokenException) {
        this.clearAuthCookies(response);
      }
      throw error;
    }
    this.setAuthCookies(response, tokens);
    const principal = this.tokenService.verifyAccessToken(tokens.accessToken);
    const user = await this.usersService.findById(principal.userId);
    return new AuthenticatedUserDto(new UserDto(user), tokens.accessTokenExpiresAt);
  }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(AccessTokenGuard)
  @ApiCookieAuth('access_token')
  @ApiOperation({ summary: 'Logout the current session' })
  @ApiNoContentResponse()
  async logout(
    @CurrentUser() principal: AuthenticatedUser,
    @Res({ passthrough: true }) response: ResponseLike,
  ): Promise<void> {
    await this.authService.logout(principal);
    this.clearAuthCookies(response);
  }

  @Post('logout-all')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(AccessTokenGuard)
  @ApiCookieAuth('access_token')
  @ApiOperation({ summary: 'Logout every session for the current user' })
  @ApiNoContentResponse()
  async logoutAll(
    @CurrentUser() principal: AuthenticatedUser,
    @Res({ passthrough: true }) response: ResponseLike,
  ): Promise<void> {
    await this.authService.logoutAll(principal.userId);
    this.clearAuthCookies(response);
  }

  @Get('me')
  @UseGuards(AccessTokenGuard)
  @ApiCookieAuth('access_token')
  @ApiOperation({ summary: 'Get the current user' })
  @ApiOkResponse({ type: UserDto })
  async me(@CurrentUser() principal: AuthenticatedUser): Promise<UserDto> {
    return new UserDto(await this.usersService.assertActive(principal.userId));
  }

  private context(
    request: RequestLike,
    deviceName: string | null | undefined,
  ): AuthenticationContext {
    return {
      deviceName: deviceName?.trim() || null,
      userAgent: request.get('user-agent') ?? null,
      ipAddress: request.ip || null,
    };
  }

  private setAuthCookies(response: ResponseLike, tokens: AuthTokens): void {
    const secure = this.config.getOrThrow<boolean>('COOKIE_SECURE');
    const accessTtl = this.config.getOrThrow<number>('ACCESS_TOKEN_TTL_SECONDS');
    const refreshTtl = this.config.getOrThrow<number>('REFRESH_TOKEN_TTL_SECONDS');

    response.cookie(ACCESS_TOKEN_COOKIE, tokens.accessToken, {
      httpOnly: true,
      secure,
      sameSite: 'lax',
      path: '/',
      maxAge: accessTtl * 1000,
    });
    response.cookie(REFRESH_TOKEN_COOKIE, tokens.refreshToken, {
      httpOnly: true,
      secure,
      sameSite: 'lax',
      path: '/api/v1/auth/refresh',
      maxAge: refreshTtl * 1000,
    });
  }

  private clearAuthCookies(response: ResponseLike): void {
    const secure = this.config.getOrThrow<boolean>('COOKIE_SECURE');
    response.clearCookie(ACCESS_TOKEN_COOKIE, {
      httpOnly: true,
      secure,
      sameSite: 'lax',
      path: '/',
    });
    response.clearCookie(REFRESH_TOKEN_COOKIE, {
      httpOnly: true,
      secure,
      sameSite: 'lax',
      path: '/api/v1/auth/refresh',
    });
  }
}
