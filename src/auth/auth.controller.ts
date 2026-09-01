import { Body, Controller, Get, HttpCode, HttpStatus, Post, Req, Res, UseGuards } from '@nestjs/common';
import { Response } from 'express';
import { createAppConfiguration } from '../config/environment';
import { ApiBearerAuth, ApiConflictResponse, ApiCreatedResponse, ApiOkResponse, ApiOperation, ApiTags, ApiUnauthorizedResponse } from '@nestjs/swagger';
import { User } from '../users/entities/user.entity';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { LoginResponseDto } from './dto/login-response.dto';
import { RegisterDto } from './dto/register.dto';
import { UserResponseDto } from './dto/user-response.dto';
import { JwtAuthGuard } from './jwt-auth.guard';

@ApiTags('Authentication')
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}
  @Post('register') @ApiOperation({ summary: 'Register a standard user account' }) @ApiCreatedResponse({ type: UserResponseDto }) @ApiConflictResponse({ description: 'An account already exists for the email.' })
  register(@Body() dto: RegisterDto): Promise<UserResponseDto> { return this.auth.register(dto); }
  @Post('login') @HttpCode(HttpStatus.OK) @ApiOperation({ summary: 'Authenticate with email or phone number and password' }) @ApiOkResponse({ type: LoginResponseDto }) @ApiUnauthorizedResponse({ description: 'Invalid email or password.' })
  async login(@Body() dto: LoginDto, @Res({ passthrough: true }) response: Response): Promise<LoginResponseDto> { return this.withCookie(await this.auth.login(dto), response); }
  @Post('refresh') @HttpCode(HttpStatus.OK) @ApiOperation({ summary: 'Rotate the HttpOnly refresh cookie and issue a new access token' }) @ApiOkResponse({ type: LoginResponseDto }) @ApiUnauthorizedResponse()
  async refresh(@Req() request: { headers: { cookie?: string } }, @Res({ passthrough: true }) response: Response): Promise<LoginResponseDto> { return this.withCookie(await this.auth.refresh(this.cookie(request.headers.cookie)), response); }
  @Post('logout') @HttpCode(HttpStatus.NO_CONTENT) @ApiOperation({ summary: 'Revoke the current refresh session and clear its cookie' })
  async logout(@Req() request: { headers: { cookie?: string } }, @Res({ passthrough: true }) response: Response): Promise<void> { await this.auth.logout(this.cookie(request.headers.cookie)); this.clear(response); }
  @Post('logout-all') @UseGuards(JwtAuthGuard) @HttpCode(HttpStatus.NO_CONTENT) @ApiBearerAuth() @ApiOperation({ summary: 'Revoke every refresh session for the authenticated user' })
  async logoutAll(@Req() request: { user: User }, @Res({ passthrough: true }) response: Response): Promise<void> { await this.auth.logoutAll(request.user.id); this.clear(response); }
  @Get('me') @UseGuards(JwtAuthGuard) @ApiBearerAuth() @ApiOperation({ summary: 'Get the authenticated user identity' }) @ApiOkResponse({ type: UserResponseDto }) @ApiUnauthorizedResponse({ description: 'Authentication is required.' })
  me(@Req() request: { user: User }): UserResponseDto { return this.auth.me(request.user); }
  private withCookie(result: LoginResponseDto & { refreshToken?: string }, response: Response): LoginResponseDto { const token=result.refreshToken!; delete result.refreshToken; const c=createAppConfiguration(); response.cookie('refreshToken', token, { httpOnly:true, secure:c.auth.cookieSecure, sameSite:c.auth.cookieSameSite, domain:c.auth.cookieDomain, path:'/api/v1/auth', maxAge:c.auth.refreshTokenTtl*1000 }); return result; }
  private clear(response: Response): void { response.clearCookie('refreshToken', { path:'/api/v1/auth' }); }
  private cookie(header?: string): string | undefined { return header?.split(';').map(value => value.trim()).find(value => value.startsWith('refreshToken='))?.slice('refreshToken='.length); }
}
