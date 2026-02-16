import { randomUUID, timingSafeEqual } from 'node:crypto';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ServerConfigService } from '../config/server-config.service';
import type { ServerAuthConfig } from '../config/server-config.types';
import type {
  AccessTokenPayload,
  AuthTokenPair,
  RefreshTokenPayload,
} from './auth.types';

type RefreshTokenRecord = {
  username: string;
  expiresAt: number;
};

function secureEqual(expected: string, actual: string): boolean {
  const expectedBuffer = Buffer.from(expected);
  const actualBuffer = Buffer.from(actual);
  if (expectedBuffer.length !== actualBuffer.length) return false;
  return timingSafeEqual(expectedBuffer, actualBuffer);
}

@Injectable()
export class AuthService {
  private readonly refreshTokenStore = new Map<string, RefreshTokenRecord>();

  constructor(
    private readonly jwtService: JwtService,
    private readonly serverConfigService: ServerConfigService,
  ) {}

  async login(username: string, password: string): Promise<AuthTokenPair> {
    const config = await this.serverConfigService.load();
    const auth = config.auth;

    if (
      !secureEqual(auth.username, username) ||
      !secureEqual(auth.password, password)
    ) {
      throw new UnauthorizedException('Invalid username or password');
    }

    return this.issueTokenPair(auth.username, auth);
  }

  async refresh(refreshToken: string): Promise<AuthTokenPair> {
    const config = await this.serverConfigService.load();
    const auth = config.auth;
    this.pruneExpiredRefreshTokens();

    let payload: RefreshTokenPayload;
    try {
      payload = this.jwtService.verify<RefreshTokenPayload>(refreshToken, {
        secret: auth.refreshTokenSecret,
      });
    } catch {
      throw new UnauthorizedException('Invalid refresh token');
    }

    if (payload.type !== 'refresh' || !payload.sub || !payload.jti) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    const record = this.refreshTokenStore.get(payload.jti);
    if (
      !record ||
      record.username !== payload.sub ||
      record.expiresAt <= Date.now()
    ) {
      this.refreshTokenStore.delete(payload.jti);
      throw new UnauthorizedException('Refresh token expired or revoked');
    }

    this.refreshTokenStore.delete(payload.jti);
    return this.issueTokenPair(payload.sub, auth);
  }

  async revokeRefreshToken(refreshToken: string): Promise<void> {
    const config = await this.serverConfigService.load();
    let payload: RefreshTokenPayload | null = null;
    try {
      payload = this.jwtService.verify<RefreshTokenPayload>(refreshToken, {
        secret: config.auth.refreshTokenSecret,
      });
    } catch {
      return;
    }
    if (payload?.jti) {
      this.refreshTokenStore.delete(payload.jti);
    }
  }

  async verifyAccessToken(accessToken: string): Promise<AccessTokenPayload> {
    const config = await this.serverConfigService.load();
    let payload: AccessTokenPayload;
    try {
      payload = this.jwtService.verify<AccessTokenPayload>(accessToken, {
        secret: config.auth.accessTokenSecret,
      });
    } catch {
      throw new UnauthorizedException('Invalid access token');
    }

    if (payload.type !== 'access' || !payload.sub || !payload.jti) {
      throw new UnauthorizedException('Invalid access token');
    }
    return payload;
  }

  private issueTokenPair(
    username: string,
    auth: ServerAuthConfig,
  ): AuthTokenPair {
    this.pruneExpiredRefreshTokens();

    const accessJti = randomUUID();
    const refreshJti = randomUUID();
    const now = Date.now();
    const refreshExpiresAt = now + auth.refreshTokenTtlSeconds * 1000;

    const accessToken = this.jwtService.sign(
      {
        sub: username,
        type: 'access',
        jti: accessJti,
      } satisfies AccessTokenPayload,
      {
        secret: auth.accessTokenSecret,
        expiresIn: auth.accessTokenTtlSeconds,
      },
    );

    const refreshToken = this.jwtService.sign(
      {
        sub: username,
        type: 'refresh',
        jti: refreshJti,
      } satisfies RefreshTokenPayload,
      {
        secret: auth.refreshTokenSecret,
        expiresIn: auth.refreshTokenTtlSeconds,
      },
    );

    this.refreshTokenStore.set(refreshJti, {
      username,
      expiresAt: refreshExpiresAt,
    });

    return {
      tokenType: 'Bearer',
      accessToken,
      refreshToken,
      accessTokenExpiresIn: auth.accessTokenTtlSeconds,
      refreshTokenExpiresIn: auth.refreshTokenTtlSeconds,
    };
  }

  private pruneExpiredRefreshTokens(): void {
    const now = Date.now();
    for (const [jti, record] of this.refreshTokenStore.entries()) {
      if (record.expiresAt <= now) {
        this.refreshTokenStore.delete(jti);
      }
    }
  }
}
