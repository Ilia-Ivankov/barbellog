import { randomUUID, scryptSync, timingSafeEqual } from 'node:crypto';
import { Router } from 'express';
import { getDatabase } from '../db/database.js';
import { requireAuth, userId } from '../middlewares/auth.middleware.js';
import { asyncRoute, fail, normalizeEmail, requiredString } from '../utils/http.js';
import { createToken } from '../utils/jwt.js';

const router = Router();
const hashPassword = (password: string, salt: string = randomUUID()) => {
  const hash = scryptSync(password, salt, 64).toString('hex');
  return { salt, hash };
};

router.post('/register', asyncRoute((req, res) => {
  const email = normalizeEmail(req.body?.email);
  const displayName = requiredString(req.body?.displayName, 'displayName', 120);
  if (typeof req.body?.password !== 'string' || req.body.password.length < 8 || req.body.password.length > 200) {
    fail(400, 'VALIDATION_ERROR', 'Пароль должен содержать от 8 до 200 символов');
  }
  const db = getDatabase();
  const existing = db.prepare('SELECT 1 FROM users WHERE email = ?').get(email);
  if (existing) fail(409, 'EMAIL_EXISTS', 'Пользователь с таким email уже зарегистрирован');
  const id = randomUUID();
  const { salt, hash } = hashPassword(req.body.password);
  db.prepare('INSERT INTO users (id, email, password_hash, display_name) VALUES (?, ?, ?, ?)')
    .run(id, email, `${salt}:${hash}`, displayName);
  res.status(201).json({ data: { user: { id, email, displayName }, token: createToken(id) } });
}));

router.post('/login', asyncRoute((req, res) => {
  const email = normalizeEmail(req.body?.email);
  if (typeof req.body?.password !== 'string') fail(400, 'VALIDATION_ERROR', 'password: ожидается строка');
  const db = getDatabase();
  const user = db.prepare('SELECT id, email, display_name, password_hash FROM users WHERE email = ?')
    .get(email) as { id: string; email: string; display_name: string; password_hash: string } | undefined;
  const [salt, storedHash] = user?.password_hash.split(':') ?? [];
  const actual = salt ? Buffer.from(hashPassword(req.body.password, salt).hash, 'hex') : Buffer.alloc(64);
  const expected = storedHash ? Buffer.from(storedHash, 'hex') : Buffer.alloc(64);
  if (!user || actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
    fail(401, 'INVALID_CREDENTIALS', 'Неверный email или пароль');
  }
  res.json({ data: { user: { id: user.id, email: user.email, displayName: user.display_name }, token: createToken(user.id) } });
}));

router.get('/me', requireAuth, asyncRoute((req, res) => {
  const db = getDatabase();
  const user = db.prepare('SELECT id, email, display_name FROM users WHERE id = ?').get(userId(req)) as
    { id: string; email: string; display_name: string } | undefined;
  if (!user) fail(401, 'UNAUTHORIZED', 'Учётная запись не найдена');
  res.json({ data: { id: user.id, email: user.email, displayName: user.display_name } });
}));

export default router;
