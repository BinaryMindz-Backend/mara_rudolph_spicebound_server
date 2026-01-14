import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { SignupDto } from './dto/signup.dto.js';
import { LoginDto } from './dto/login.dto.js';
import { PrismaService } from '../prisma/prisma.service.js';


@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
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
      name: dto.name,
      email: dto.email,
      password: hashedPassword,
    },
  });

  // Explicitly remove password
  const { password, ...user } = createdUser;

  return this.generateAuthResponse(user);
}



async login(dto: LoginDto) {
  const user = await this.prisma.user.findUnique({
    where: { email: dto.email },
  });

  if (!user) {
    throw new UnauthorizedException('Invalid credentials');
  }

  const passwordMatch = await bcrypt.compare(
    dto.password,
    user.password,
  );

  if (!passwordMatch) {
    throw new UnauthorizedException('Invalid credentials');
  }

  const { password, ...safeUser } = user;

  return this.generateAuthResponse(safeUser);
}



  private generateAuthResponse(user: any) {
    const payload = {
      sub: user.id,
      email: user.email,
      isPremium: user.isPremium,
    };

    return {
      accessToken: this.jwtService.sign(payload),
      user: {
        id: user.id,
        firstName: user.firstName,
        email: user.email,
        isPremium: user.isPremium,
      },
    };
  }
}
