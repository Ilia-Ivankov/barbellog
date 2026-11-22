import type { NextFunction, Request, Response } from 'express';
import { ApiError } from '../utils/http.js';
import { verifyToken } from '../utils/jwt.js';

declare global {
  namespace Express {
    interface Request { userId?: string }
  }
}

export function requireAuth(req: Request, _res: Response, next: NextFunction) {
  const authorization = req.header('authorization');
  if (!authorization?.startsWith('Bearer ')) {
    next(new ApiError(401, 'UNAUTHORIZED', 'Требуется Bearer токен'));
    return;
  }
  try {
    req.userId = verifyToken(authorization.slice(7));
    next();
  } catch (error) {
    next(error);
  }
}

export function userId(req: Request): string {
  if (!req.userId) throw new ApiError(401, 'UNAUTHORIZED', 'Требуется авторизация');
  return req.userId;
}
