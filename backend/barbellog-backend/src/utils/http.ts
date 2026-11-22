import type { NextFunction, Request, Response } from 'express';

export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string) {
    super(message);
  }
}

export function fail(status: number, code: string, message: string): never {
  throw new ApiError(status, code, message);
}

export function asyncRoute(
  handler: (req: Request, res: Response) => unknown | Promise<unknown>,
) {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(handler(req, res)).catch(next);
  };
}

export function errorHandler(error: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (error instanceof ApiError) {
    res.status(error.status).json({ error: { code: error.code, message: error.message } });
    return;
  }

  const candidate = error as { type?: string; code?: string };
  if (candidate?.type === 'entity.parse.failed') {
    res.status(400).json({ error: { code: 'INVALID_JSON', message: 'Некорректный JSON' } });
    return;
  }
  if (candidate?.code?.startsWith('SQLITE_CONSTRAINT')) {
    res.status(409).json({ error: { code: 'CONFLICT', message: 'Запись конфликтует с существующими данными' } });
    return;
  }
  console.error(error);
  res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Внутренняя ошибка сервера' } });
}

export function requiredString(value: unknown, field: string, maxLength: number): string {
  if (typeof value !== 'string') fail(400, 'VALIDATION_ERROR', `${field}: ожидается строка`);
  const result = value.normalize('NFKC').trim();
  if (!result || result.length > maxLength) fail(400, 'VALIDATION_ERROR', `${field}: неверная длина`);
  return result;
}

export function optionalString(value: unknown, field: string, maxLength: number): string {
  if (value === undefined || value === null) return '';
  if (typeof value !== 'string') fail(400, 'VALIDATION_ERROR', `${field}: ожидается строка`);
  const result = value.normalize('NFKC').trim();
  if (result.length > maxLength) fail(400, 'VALIDATION_ERROR', `${field}: слишком длинное значение`);
  return result;
}

export function validDate(value: unknown, field: string): string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    fail(400, 'VALIDATION_ERROR', `${field}: дата должна быть в формате YYYY-MM-DD`);
  }
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.valueOf()) || date.toISOString().slice(0, 10) !== value) {
    fail(400, 'VALIDATION_ERROR', `${field}: некорректная дата`);
  }
  return value;
}

export function routeParam(req: Request, key: string): string {
  const value = req.params[key];
  if (typeof value !== 'string' || !value) fail(400, 'VALIDATION_ERROR', `Некорректный параметр ${key}`);
  return value;
}

export function normalizeEmail(value: unknown): string {
  const email = requiredString(value, 'email', 320).normalize('NFKC').toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fail(400, 'VALIDATION_ERROR', 'Некорректный email');
  return email;
}
