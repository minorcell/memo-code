import { BadRequestException, Body, Controller, Post } from '@nestjs/common';
import { Public } from './public.decorator';
import { AuthService } from './auth.service';

type LoginBody = {
  username?: unknown;
  password?: unknown;
};

type RefreshBody = {
  refreshToken?: unknown;
};

function requiredString(value: unknown, field: string): string {
  if (typeof value !== 'string') {
    throw new BadRequestException(`${field} is required`);
  }
  const trimmed = value.trim();
  if (!trimmed) {
    throw new BadRequestException(`${field} is required`);
  }
  return trimmed;
}

@Public()
@Controller('api/auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('login')
  async login(@Body() body: LoginBody) {
    const username = requiredString(body.username, 'username');
    const password = requiredString(body.password, 'password');
    return this.authService.login(username, password);
  }

  @Post('refresh')
  async refresh(@Body() body: RefreshBody) {
    const refreshToken = requiredString(body.refreshToken, 'refreshToken');
    return this.authService.refresh(refreshToken);
  }

  @Post('logout')
  async logout(@Body() body: RefreshBody) {
    const refreshToken = requiredString(body.refreshToken, 'refreshToken');
    await this.authService.revokeRefreshToken(refreshToken);
    return { loggedOut: true };
  }
}
