import { Controller, Post, Body, UnauthorizedException, HttpCode, HttpStatus } from '@nestjs/common';
import { AuthService } from './auth.service.js';
import { Public } from './decorators/public.decorator.js';

@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  @Public()
  @HttpCode(HttpStatus.OK)
  @Post('admin/login')
  async login(@Body() body: Record<string, any>) {
    // For a real production app, use class-validator DTOs. Using any for brevity here.
    if (!body.email || !body.password) {
      throw new UnauthorizedException('Email and password required');
    }

    const user = await this.authService.validateAdmin(body.email, body.password);
    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }
    
    return this.authService.login(user);
  }
}
