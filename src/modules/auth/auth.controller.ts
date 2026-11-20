import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
// biome-ignore lint/style/useImportType: Nest dependency injection needs runtime constructor tokens.
import { ConfigService } from '@nestjs/config';
import {
  ApiAcceptedResponse,
  ApiBody,
  ApiCookieAuth,
  ApiCreatedResponse,
  ApiFoundResponse,
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
import {
  ACCESS_TOKEN_COOKIE,
  GOOGLE_OAUTH_STATE_COOKIE,
  REFRESH_TOKEN_COOKIE,
  REGISTRATION_INTENT_COOKIE,
} from './constants.js';
import { CurrentUser } from './decorators/current-user.decorator.js';
import { AuthenticatedUserDto } from './dtos/authenticated-user.dto.js';
// biome-ignore lint/style/useImportType: Nest validation and Swagger need the DTO constructor at runtime.
import { CompleteGoogleRegistrationDto } from './dtos/complete-google-registration.dto.js';
// biome-ignore lint/style/useImportType: Nest validation and Swagger need the DTO constructor at runtime.
import { GoogleCallbackQueryDto } from './dtos/google-callback-query.dto.js';
// biome-ignore lint/style/useImportType: Nest validation and Swagger need the DTO constructor at runtime.
import { GoogleLoginQueryDto } from './dtos/google-login-query.dto.js';
import { LoginDto } from './dtos/login.dto.js';
// biome-ignore lint/style/useImportType: Nest validation and Swagger need the DTO constructor at runtime.
import { RegisterDto } from './dtos/register.dto.js';
import { RegistrationAcceptedDto } from './dtos/registration-accepted.dto.js';
import { RegistrationContextDto } from './dtos/registration-context.dto.js';
// biome-ignore lint/style/useImportType: Nest validation and Swagger need the DTO constructor at runtime.
import { ResendVerificationDto } from './dtos/resend-verification.dto.js';
// biome-ignore lint/style/useImportType: Nest validation and Swagger need the DTO constructor at runtime.
import { VerifyEmailDto } from './dtos/verify-email.dto.js';
import {
  InvalidRefreshTokenException,
  InvalidRegistrationIntentException,
} from './exceptions/auth.exceptions.js';
import { AccessTokenGuard } from './guards/access-token.guard.js';
// biome-ignore lint/style/useImportType: Nest dependency injection needs runtime constructor tokens.
import { GoogleOidcService } from './services/google-oidc.service.js';
// biome-ignore lint/style/useImportType: Nest dependency injection needs runtime constructor tokens.
import { RegistrationService } from './services/registration.service.js';
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
  redirect(status: number, url: string): void;
};

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly usersService: UsersService,
    private readonly config: ConfigService,
    private readonly tokenService: TokenService,
    private readonly registrationService: RegistrationService,
    private readonly googleOidcService: GoogleOidcService,
  ) {}

  @Post('register')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({ summary: 'Register a student account with email and password' })
  @ApiAcceptedResponse({ type: RegistrationAcceptedDto })
  async register(@Body() dto: RegisterDto): Promise<RegistrationAcceptedDto> {
    await this.registrationService.register(dto);
    return new RegistrationAcceptedDto();
  }

  @Post('email/resend')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({ summary: 'Resend an email verification link' })
  @ApiAcceptedResponse({ type: RegistrationAcceptedDto })
  async resendVerification(@Body() dto: ResendVerificationDto): Promise<RegistrationAcceptedDto> {
    await this.registrationService.resendVerification(dto.email);
    return new RegistrationAcceptedDto();
  }

  @Post('email/verify')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Verify an email address and start a session' })
  @ApiOkResponse({ type: AuthenticatedUserDto })
  async verifyEmail(
    @Body() dto: VerifyEmailDto,
    @Req() request: RequestLike,
    @Res({ passthrough: true }) response: ResponseLike,
  ): Promise<AuthenticatedUserDto> {
    const result = await this.registrationService.verifyEmail(
      dto.token,
      this.context(request, dto.deviceName),
    );
    this.setAuthCookies(response, result.tokens);
    const user = await this.usersService.findById(result.userId);
    return new AuthenticatedUserDto(new UserDto(user), result.tokens.accessTokenExpiresAt);
  }

  @Get('google')
  @ApiOperation({ summary: 'Start Google sign-in or registration' })
  @ApiFoundResponse({ description: 'Redirects to Google' })
  async google(@Query() query: GoogleLoginQueryDto, @Res() response: ResponseLike): Promise<void> {
    const returnTo = query.returnTo ?? this.config.getOrThrow<string>('GOOGLE_AUTH_SUCCESS_PATH');
    const start = await this.googleOidcService.begin(returnTo);
    response.cookie(GOOGLE_OAUTH_STATE_COOKIE, start.stateCookie, {
      ...this.transientCookieOptions('/api/v1/auth/google/callback'),
      maxAge: start.maxAgeMilliseconds,
    });
    response.redirect(HttpStatus.FOUND, start.authorizationUrl);
  }

  @Get('google/callback')
  @ApiOperation({ summary: 'Google OAuth callback' })
  @ApiFoundResponse({ description: 'Redirects to the frontend after Google authentication' })
  async googleCallback(
    @Query() query: GoogleCallbackQueryDto,
    @Req() request: RequestLike,
    @Res() response: ResponseLike,
  ): Promise<void> {
    try {
      const google = await this.googleOidcService.complete(
        query,
        request.cookies?.[GOOGLE_OAUTH_STATE_COOKIE],
      );
      const result = await this.registrationService.handleGoogleCallback(
        google.profile,
        google.returnTo,
        this.context(request, 'Google'),
      );
      this.clearTransientCookie(
        response,
        GOOGLE_OAUTH_STATE_COOKIE,
        '/api/v1/auth/google/callback',
      );
      if (result.kind === 'authenticated') {
        this.setAuthCookies(response, result.tokens);
        response.redirect(HttpStatus.FOUND, this.frontendUrl(result.returnTo));
        return;
      }

      response.cookie(REGISTRATION_INTENT_COOKIE, result.onboardingToken, {
        ...this.transientCookieOptions('/api/v1/auth'),
        maxAge: result.maxAgeMilliseconds,
      });
      response.redirect(
        HttpStatus.FOUND,
        this.frontendUrl(this.config.getOrThrow<string>('GOOGLE_REGISTRATION_PATH')),
      );
    } catch {
      this.clearTransientCookie(
        response,
        GOOGLE_OAUTH_STATE_COOKIE,
        '/api/v1/auth/google/callback',
      );
      const errorUrl = new URL(
        this.config.getOrThrow<string>('GOOGLE_AUTH_ERROR_PATH'),
        this.config.getOrThrow<string>('FRONTEND_BASE_URL'),
      );
      errorUrl.searchParams.set('error', 'google_authentication_failed');
      response.redirect(HttpStatus.FOUND, errorUrl.toString());
    }
  }

  @Get('registration-context')
  @ApiCookieAuth('registration_intent')
  @ApiOperation({ summary: 'Get prefilled profile data for Google registration' })
  @ApiOkResponse({ type: RegistrationContextDto })
  async registrationContext(@Req() request: RequestWithCookies): Promise<RegistrationContextDto> {
    const rawToken = request.cookies?.[REGISTRATION_INTENT_COOKIE];
    if (rawToken === undefined) {
      throw new InvalidRegistrationIntentException();
    }
    const intent = await this.registrationService.getRegistrationContext(rawToken);
    return new RegistrationContextDto({
      email: intent.verifiedEmail,
      displayName: intent.displayNameHint,
      avatarUrl: intent.avatarUrlHint,
      expiresAt: intent.expiresAt,
    });
  }

  @Post('google/complete-registration')
  @HttpCode(HttpStatus.CREATED)
  @ApiCookieAuth('registration_intent')
  @ApiOperation({ summary: 'Complete the profile for a new Google account' })
  @ApiCreatedResponse({ type: AuthenticatedUserDto })
  async completeGoogleRegistration(
    @Body() dto: CompleteGoogleRegistrationDto,
    @Req() request: RequestLike,
    @Res({ passthrough: true }) response: ResponseLike,
  ): Promise<AuthenticatedUserDto> {
    const rawToken = request.cookies?.[REGISTRATION_INTENT_COOKIE];
    if (rawToken === undefined) {
      throw new InvalidRegistrationIntentException();
    }
    const result = await this.registrationService.completeGoogleRegistration(
      rawToken,
      dto,
      this.context(request, dto.deviceName ?? 'Google'),
    );
    this.clearTransientCookie(response, REGISTRATION_INTENT_COOKIE, '/api/v1/auth');
    this.setAuthCookies(response, result.tokens);
    const user = await this.usersService.findById(result.userId);
    return new AuthenticatedUserDto(new UserDto(user), result.tokens.accessTokenExpiresAt);
  }

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

  private transientCookieOptions(path: string): Record<string, unknown> {
    return {
      httpOnly: true,
      secure: this.config.getOrThrow<boolean>('COOKIE_SECURE'),
      sameSite: 'lax',
      path,
    };
  }

  private clearTransientCookie(response: ResponseLike, name: string, path: string): void {
    response.clearCookie(name, this.transientCookieOptions(path));
  }

  private frontendUrl(path: string): string {
    return new URL(path, this.config.getOrThrow<string>('FRONTEND_BASE_URL')).toString();
  }
}
