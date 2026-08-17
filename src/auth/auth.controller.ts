import { Body, Controller, Get, HttpCode, HttpStatus, Post, Req, UseGuards } from '@nestjs/common';
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
  @Post('login') @HttpCode(HttpStatus.OK) @ApiOperation({ summary: 'Authenticate with email and password' }) @ApiOkResponse({ type: LoginResponseDto }) @ApiUnauthorizedResponse({ description: 'Invalid email or password.' })
  login(@Body() dto: LoginDto): Promise<LoginResponseDto> { return this.auth.login(dto); }
  @Get('me') @UseGuards(JwtAuthGuard) @ApiBearerAuth() @ApiOperation({ summary: 'Get the authenticated user identity' }) @ApiOkResponse({ type: UserResponseDto }) @ApiUnauthorizedResponse({ description: 'Authentication is required.' })
  me(@Req() request: { user: User }): UserResponseDto { return this.auth.me(request.user); }
}
