import { Body, Controller, Get, Post, Put, UseGuards } from '@nestjs/common';
import { AuthService } from './auth.service.js';
import { SignupDto } from './dto/signup.dto.js';
import { LoginDto } from './dto/login.dto.js';
import { RefreshTokenDto } from './dto/refresh-token.dto.js';
import { UpdateProfileDto } from './dto/update-profile.dto.js';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard.js';
import { CurrentUser } from '../../common/decorators/user.decorators.js';
import { ChangePasswordDto } from './dto/change-password.dto.js';
import { ForgotPasswordDto } from './dto/forgot-password.dto.js';
import { ResetPasswordDto } from './dto/reset-password.dto.js';
import { ApiBearerAuth, ApiOperation, ApiTags, ApiBody } from '@nestjs/swagger';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('signup')
  @ApiOperation({ summary: 'Create a new user account' })
  signup(@Body() dto: SignupDto) {
    return this.authService.signup(dto);
  }

  @Post('login')
  @ApiOperation({ summary: 'User login' })
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  @Post('refresh')
  @ApiOperation({ summary: 'Refresh access token using refresh token' })
  refresh(@Body() dto: RefreshTokenDto) {
    return this.authService.refresh(dto);
  }

  @ApiTags('Auth')
  @ApiBearerAuth('access-token')
  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Get current logged-in user' })
  getMe(@CurrentUser() userId: string) {
    return this.authService.getMe(userId);
  }

  @ApiTags('Auth')
  @ApiBearerAuth('access-token')
  @Post('change-password')
  @ApiOperation({ summary: 'Change user password' })
  @UseGuards(JwtAuthGuard)
  changePassword(
    @CurrentUser() userId: string,
    @Body() dto: ChangePasswordDto,
  ) {
    return this.authService.changePassword(userId, dto);
  }

  @ApiTags('Auth')
  @ApiBearerAuth('access-token')
  @Post('logout')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Logout and revoke refresh token' })
  logout(@CurrentUser() userId: string) {
    return this.authService.logout(userId);
  }

  @ApiTags('Auth')
  @ApiBearerAuth('access-token')
  @Put('profile')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Update user profile (name, email, password)' })
  @ApiBody({
    description: 'Update profile - all fields optional. At least one field must be provided.',
    type: UpdateProfileDto,
    examples: {
      'Change Name': {
        value: { name: 'John Updated' },
        description: 'Update only name',
      },
      'Change Email': {
        value: { email: 'newemail@example.com' },
        description: 'Update only email',
      },
      'Change Password': {
        value: { password: 'NewSecurePass123!' },
        description: 'Update only password (min 8 characters)',
      },
      'Change All': {
        value: {
          name: 'John Doe',
          email: 'john.doe@example.com',
          password: 'NewSecurePass123!',
        },
        description: 'Update name, email, and password',
      },
    },
  })
  updateProfile(
    @CurrentUser() userId: string,
    @Body() dto: UpdateProfileDto,
  ) {
    return this.authService.updateProfile(userId, dto);
  }

  @Post('forgot-password')
  @ApiOperation({ summary: 'Request password reset' })
  forgotPassword(@Body() dto: ForgotPasswordDto) {
    return this.authService.forgotPassword(dto);
  }

  @Post('reset-password')
  @ApiOperation({ summary: 'Reset password with token' })
  resetPassword(@Body() dto: ResetPasswordDto) {
    return this.authService.resetPassword(dto);
  }
}
