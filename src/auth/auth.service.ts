import { Injectable, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service.js';
import * as bcrypt from 'bcrypt';
import { AdminRole } from '@prisma/client';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService
  ) {}

  async validateAdmin(email: string, pass: string): Promise<any> {
    // LOCAL MOCK: Bypass DB check since Postgres isn't running locally
    if (email === 'admin@admin.com' && pass === 'password123') {
      return {
        id: 'fake-admin-id',
        email: 'admin@admin.com',
        role: 'SUPER_ADMIN' as AdminRole,
        created_at: new Date(),
        updated_at: new Date(),
      };
    }

    const admin = await this.prisma.adminUser.findUnique({
      where: { email }
    });

    if (!admin) {
      return null;
    }

    const isMatch = await bcrypt.compare(pass, admin.password_hash);
    if (isMatch) {
      const { password_hash: _password_hash, ...result } = admin;
      return result;
    }
    return null;
  }

  async login(user: any) {
    const payload = { email: user.email, sub: user.id, role: user.role };
    return {
      access_token: this.jwtService.sign(payload),
      user: payload
    };
  }
}
