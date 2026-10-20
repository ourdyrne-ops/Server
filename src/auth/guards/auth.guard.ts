import { Injectable, CanActivate, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator.js';

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    private jwtService: JwtService
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    
    // Check for standard JWT auth (Admin Panel)
    const token = this.extractTokenFromHeader(request);
    
    if (token) {
      try {
        const payload = await this.jwtService.verifyAsync(token, {
          secret: process.env.JWT_SECRET || 'fallback_dev_secret_only'
        });
        request.user = payload;
        return true;
      } catch {
        // Fallthrough: maybe it's a Telegram request?
      }
    }

    // Checking if Telegram webhook sets the user manually (done in TelegramService)
    if (request.user) {
      return true;
    }
    
    throw new UnauthorizedException();
  }

  private extractTokenFromHeader(request: any): string | undefined {
    const [type, token] = request.headers.authorization?.split(' ') ?? [];
    return type === 'Bearer' ? token : undefined;
  }
}
