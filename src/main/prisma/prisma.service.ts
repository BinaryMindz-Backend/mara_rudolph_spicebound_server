import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../../prisma/generated/prisma-client/client.js';

@Injectable()
export class PrismaService
  extends PrismaClient
<<<<<<< HEAD
  implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  constructor(private readonly configService: ConfigService) {
    const connectionString =
      configService.getOrThrow<string>('DATABASE_URL');
=======
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(PrismaService.name);
  private readonly prisma: PrismaClient;

  constructor(private readonly configService: ConfigService) {
    const connectionString = configService.getOrThrow<string>('DATABASE_URL');
>>>>>>> 891f4ee122a63280f71cb53dd1cdcf15936f426b

    const adapter = new PrismaPg({ connectionString });

    super({
      adapter,
      log: [{ emit: 'event', level: 'error' }],
    });
<<<<<<< HEAD
  }

  async onModuleInit() {
    this.logger.log('[INIT] Prisma connecting...');
    await this.$connect();
    this.logger.log('[INIT] Prisma connected');
  }

  async onModuleDestroy() {
    this.logger.log('[DESTROY] Prisma disconnecting...');
    await this.$disconnect();
    this.logger.log('[DESTROY] Prisma disconnected');
  }
=======

    this.prisma = new PrismaClient({
      adapter,
      log: [{ emit: 'event', level: 'error' }],
    });
  }

  async onModuleInit() {
    this.logger.log('[INIT] Prisma connecting...');
    await this.prisma.$connect();
    this.logger.log('[INIT] Prisma connected');
  }

  async onModuleDestroy() {
    this.logger.log('[DESTROY] Prisma disconnecting...');
    await this.prisma.$disconnect();
    this.logger.log('[DESTROY] Prisma disconnected');
  }

  /** Expose Prisma models (like prisma.user, prisma.post, etc.) */
  get client() {
    return this.prisma;
  }
>>>>>>> 891f4ee122a63280f71cb53dd1cdcf15936f426b
}
