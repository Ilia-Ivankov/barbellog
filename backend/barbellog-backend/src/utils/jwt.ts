import { createHmac, timingSafeEqual } from 'node:crypto';
import ENV from '../config/env.config.js';
import { ApiError } from './http.js';

const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');

export function createToken(userId: string): string {
  const header = encode({ alg: 'HS256', typ: 'JWT' });
  const payload = encode({ sub: userId, exp: Math.floor(Date.now() / 1000) + 7 * 24 * 60 * 60 });
  const input = `${header}.${payload}`;
  const signature = createHmac('sha256', ENV.JWT_SECRET).update(input).digest('base64url');
  return `${input}.${signature}`;
}

export function verifyToken(token: string): string {
  try {
    const [header, payload, signature, extra] = token.split('.');
    if (!header || !payload || !signature || extra) throw new Error('Malformed token');
    const decodedHeader = JSON.parse(Buffer.from(header, 'base64url').toString('utf8')) as { alg?: string };
    const decodedPayload = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as { sub?: string; exp?: number };
    if (decodedHeader.alg !== 'HS256' || !decodedPayload.sub || !decodedPayload.exp || decodedPayload.exp <= Date.now() / 1000) {
      throw new Error('Invalid token claims');
    }
    const expected = createHmac('sha256', ENV.JWT_SECRET).update(`${header}.${payload}`).digest();
    const actual = Buffer.from(signature, 'base64url');
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) throw new Error('Invalid signature');
    return decodedPayload.sub;
  } catch {
    throw new ApiError(401, 'UNAUTHORIZED', 'Токен отсутствует или недействителен');
  }
}
