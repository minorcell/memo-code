import type { Request } from 'express';

export type AccessTokenPayload = {
  sub: string;
  type: 'access';
  jti: string;
};

export type RefreshTokenPayload = {
  sub: string;
  type: 'refresh';
  jti: string;
};

export type AuthTokenPair = {
  tokenType: 'Bearer';
  accessToken: string;
  refreshToken: string;
  accessTokenExpiresIn: number;
  refreshTokenExpiresIn: number;
};

export type RequestUser = {
  username: string;
  tokenId: string;
};

export type AuthenticatedRequest = Request & {
  requestId?: string;
  user?: RequestUser;
};
