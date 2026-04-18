import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
  BadRequestException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { SignupDto } from './dto/signup.dto.js';
import { LoginDto } from './dto/login.dto.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { ChangePasswordDto } from './dto/change-password.dto.js';
import { ForgotPasswordDto } from './dto/forgot-password.dto.js';
import { ResetPasswordDto } from './dto/reset-password.dto.js';
import { ApiResponseUtil } from '../../common/utils/api-response.util.js';
import { EmailService } from '../../common/services/email.service.js';
import { UpdateNameDto } from './dto/update-name.dto.js';
import { DeleteAccountDto } from './dto/delete-account.dto.js';
import { SubscriptionService } from '../subscription/subscription.service.js';

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    private configService: ConfigService,
    private emailService: EmailService,
    private subscriptionService: SubscriptionService,
  ) {}

  async signup(dto: SignupDto) {
    const exists = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });

    if (exists) {
      throw new ConflictException('Email already registered');
    }

    const hashedPassword = await bcrypt.hash(dto.password, 12);

    const createdUser = await this.prisma.user.create({
      data: {
        firstName: dto.name,
        email: dto.email,
        password: hashedPassword,
      },
    });

    // Explicitly remove password and map `firstName` -> `name` for responses
    const { password, ...userRaw } = createdUser;
    const user = { ...userRaw, name: (createdUser as any).firstName };

    return await this.generateAuthResponse(user);
  }

  async login(dto: LoginDto) {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });

    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const passwordMatch = await bcrypt.compare(dto.password, user.password);

    if (!passwordMatch) {
      throw new UnauthorizedException('Invalid credentials');
    }
    const { password, ...userRaw } = user;
    const safeUser = { ...userRaw, name: (user as any).firstName };

    return await this.generateAuthResponse(safeUser);
  }

  private async generateAuthResponse(user: any) {
    const payload = {
      sub: user.id,
      email: user.email,
      plan: user.plan,
    };

    const accessToken = this.jwtService.sign(payload);

    // Create and store a refresh token (rotating refresh tokens)
    const refreshToken = await this.createAndSaveRefreshToken(user.id);

    const userPayload: Record<string, unknown> = {
      id: user.id,
      name: (user as any).name ?? (user as any).firstName ?? null,
      email: user.email,
      plan: user.plan,
      createdAt: user.createdAt,
    };

    try {
      const sub = await this.subscriptionService.getUserSubscription(user.id);
      userPayload.planInitial =
        sub.billingInterval === 'year' ? 'yearly' : 'monthly';
      userPayload.expiresAt = sub.expiresAt
        ? ((sub.expiresAt as Date).toISOString?.() ?? sub.expiresAt)
        : null;
      userPayload.subscriptionStatus = sub.status ?? null;
    } catch {
      userPayload.planInitial = null;
      userPayload.expiresAt = null;
      userPayload.subscriptionStatus = null;
    }

    const authData = {
      accessToken,
      refreshToken,
      user: userPayload,
    };

    return ApiResponseUtil.created(authData, 'Authentication successful');
  }

  private async createAndSaveRefreshToken(userId: string) {
    const refreshTokenPlain = crypto.randomBytes(64).toString('hex');
    const hashed = crypto
      .createHash('sha256')
      .update(refreshTokenPlain)
      .digest('hex');

    const days = parseInt(
      this.configService.get<string>('REFRESH_TOKEN_EXPIRES_DAYS') || '30',
      10,
    );
    const expiry = new Date(Date.now() + days * 24 * 60 * 60 * 1000);

    await this.prisma.user.update({
      where: { id: userId },
      data: { refreshToken: hashed, refreshTokenExpiry: expiry },
    });

    return refreshTokenPlain;
  }

  async refresh(dto: { refreshToken: string }) {
    if (!dto?.refreshToken) {
      throw new UnauthorizedException('Refresh token missing');
    }

    const hashed = crypto
      .createHash('sha256')
      .update(dto.refreshToken)
      .digest('hex');

    const user = await this.prisma.user.findFirst({
      where: {
        refreshToken: hashed,
        refreshTokenExpiry: { gt: new Date() },
      },
    });

    if (!user) {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    // Generate new access token
    const payload = { sub: user.id, email: user.email, plan: user.plan };
    const accessToken = this.jwtService.sign(payload);

    // Rotate refresh token
    const newRefreshToken = await this.createAndSaveRefreshToken(user.id);

    const authData = {
      accessToken,
      refreshToken: newRefreshToken,
      user: {
        id: user.id,
        name: (user as any).firstName ?? null,
        email: user.email,
        plan: user.plan,
        createdAt: user.createdAt,
      },
    };

    return ApiResponseUtil.success(authData, 'Token refreshed', 200);
  }

  async logout(userId: string) {
    await this.prisma.user.update({
      where: { id: userId },
      data: { refreshToken: null, refreshTokenExpiry: null },
    });

    return ApiResponseUtil.success(
      { success: true },
      'Logged out successfully',
      200,
    );
  }

  async updateProfile(userId: string, dto: any) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    // Check if email is being changed and if it's already taken
    if (dto.email && dto.email !== user.email) {
      const existingUser = await this.prisma.user.findUnique({
        where: { email: dto.email },
      });

      if (existingUser) {
        throw new ConflictException('Email already in use');
      }
    }

    // Hash password if being updated
    let hashedPassword: string | undefined;
    if (dto.password) {
      hashedPassword = await bcrypt.hash(dto.password, 12);
    }

    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: {
        ...(dto.name && { firstName: dto.name }),
        ...(dto.email && { email: dto.email }),
        ...(hashedPassword && { password: hashedPassword }),
      },
      select: {
        id: true,
        email: true,
        firstName: true,
        plan: true,
        createdAt: true,
      },
    });

    const mapped = {
      id: updated.id,
      email: updated.email,
      name: (updated as any).firstName ?? null,
      plan: updated.plan,
      createdAt: updated.createdAt,
    };

    return ApiResponseUtil.success(
      mapped,
      'Profile updated successfully',
      200,
    );
  }

  async getMe(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        firstName: true,
        plan: true,
        createdAt: true,
      },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    const result: Record<string, unknown> = {
      id: (user as any).id,
      email: (user as any).email,
      name: (user as any).firstName ?? null,
      plan: (user as any).plan,
      createdAt: (user as any).createdAt,
    };

    try {
      const sub = await this.subscriptionService.getUserSubscription(userId);
      result.planInitial =
        sub.billingInterval === 'year' ? 'yearly' : 'monthly';
      result.expiresAt = sub.expiresAt
        ? ((sub.expiresAt as Date).toISOString?.() ?? sub.expiresAt)
        : null;
      result.subscriptionStatus = sub.status ?? null;
    } catch {
      result.planInitial = null;
      result.expiresAt = null;
      result.subscriptionStatus = null;
    }

    return result;
  }

  async changePassword(userId: string, dto: ChangePasswordDto) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    const passwordMatch = await bcrypt.compare(
      dto.currentPassword,
      user.password,
    );
    if (!passwordMatch) {
      throw new UnauthorizedException('Current password is incorrect');
    }

    if (dto.currentPassword === dto.newPassword) {
      throw new BadRequestException(
        'New password must be different from current password',
      );
    }

    const hashedNewPassword = await bcrypt.hash(dto.newPassword, 12);

    await this.prisma.user.update({
      where: { id: user.id },
      data: { password: hashedNewPassword },
    });

    return ApiResponseUtil.success(
      { success: true },
      'Password changed successfully',
      200,
    );
  }

  async forgotPassword(dto: ForgotPasswordDto) {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });

    if (!user) {
      throw new NotFoundException('User with this email not found');
    }

    // Generate a reset token (32 bytes = 64 hex characters)
    const resetToken = crypto.randomBytes(32).toString('hex');
    const hashedToken = crypto
      .createHash('sha256')
      .update(resetToken)
      .digest('hex');

    // Token expires in 1 hour
    const resetTokenExpiry = new Date(Date.now() + 60 * 60 * 1000);

    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        resetToken: hashedToken,
        resetTokenExpiry,
      },
    });

    // Send password reset email
    await this.emailService.sendPasswordResetEmail(user.email, resetToken);

    return ApiResponseUtil.success(
      { success: true },
      'Password reset link sent to your email',
      200,
    );
  }

  async resetPassword(dto: ResetPasswordDto) {
    const hashedToken = crypto
      .createHash('sha256')
      .update(dto.token)
      .digest('hex');

    const user = await this.prisma.user.findFirst({
      where: {
        resetToken: hashedToken,
        resetTokenExpiry: {
          gt: new Date(),
        },
      },
    });

    if (!user) {
      throw new BadRequestException('Invalid or expired reset token');
    }

    const hashedNewPassword = await bcrypt.hash(dto.newPassword, 12);

    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        password: hashedNewPassword,
        resetToken: null,
        resetTokenExpiry: null,
      },
    });

    return ApiResponseUtil.success(
      { success: true },
      'Password reset successful',
      200,
    );
  }

  async updateName(userId: string, dto: UpdateNameDto) {
    const updatedUser = await this.prisma.user.update({
      where: { id: userId },
      data: { firstName: dto.name },
      select: {
        id: true,
        firstName: true,
        email: true,
        plan: true,
      },
    });

    const mapped = {
      id: updatedUser.id,
      name: (updatedUser as any).firstName ?? null,
      email: updatedUser.email,
      plan: updatedUser.plan,
    };

    return ApiResponseUtil.success(
      mapped,
      'Name updated successfully',
      200,
    );
  }

  async deleteAccount(userId: string, dto: DeleteAccountDto) {
    // Verify user exists
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    // Verify password
    const passwordMatch = await bcrypt.compare(dto.password, user.password);
    if (!passwordMatch) {
      throw new UnauthorizedException('Password is incorrect');
    }

    // Delete user account (cascading delete will handle related records)
    await this.prisma.user.delete({
      where: { id: userId },
    });

    return ApiResponseUtil.success(
      { success: true },
      'Account deleted successfully. All associated data has been removed.',
      200,
    );
  }
}
