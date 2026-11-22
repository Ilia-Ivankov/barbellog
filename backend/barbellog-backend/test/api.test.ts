import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { IncomingMessage, ServerResponse } from 'node:http';
import { Socket } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, test } from 'node:test';
import app from '../src/app.js';
import ENV from '../src/config/env.config.js';
import { closeDatabase } from '../src/db/database.js';
import { migrateDatabase } from '../src/db/migrate.js';

let directory = '';
before(() => {
  directory = mkdtempSync(join(tmpdir(), 'barbellog-api-'));
  ENV.SQLITE_PATH = join(directory, 'test.sqlite');
  migrateDatabase(ENV.SQLITE_PATH);
});
after(() => {
  closeDatabase();
  if (directory) rmSync(directory, { recursive: true, force: true });
});

async function request(path: string, options: { method?: string; token?: string; body?: unknown } = {}) {
  const req = new IncomingMessage(new Socket());
  req.method = options.method ?? 'GET';
  req.url = path;
  req.headers = {
    host: 'localhost',
    ...(options.token ? { authorization: `Bearer ${options.token}` } : {}),
    ...(options.body ? { 'content-type': 'application/json' } : {}),
  };
  const rawBody = options.body ? JSON.stringify(options.body) : '';
  if (rawBody) req.headers['content-length'] = String(Buffer.byteLength(rawBody));
  const response = new ServerResponse(req);
  let output = '';
  response.req = req;
  response.app = app;
  response.locals = {};
  response.statusCode = 200;
  response.setHeader = (name: string, value: number | string | readonly string[]) => {
    ServerResponse.prototype.setHeader.call(response, name, value);
    return response;
  };
  response.getHeader = (name: string) => ServerResponse.prototype.getHeader.call(response, name);
  response.getHeaderNames = () => ServerResponse.prototype.getHeaderNames.call(response);
  response.removeHeader = (name: string) => ServerResponse.prototype.removeHeader.call(response, name);
  response.writeHead = ((statusCode: number, headers?: Record<string, number | string | readonly string[]>) => {
    response.statusCode = statusCode;
    if (headers) for (const [name, value] of Object.entries(headers)) response.setHeader(name, value);
    return response;
  }) as ServerResponse['writeHead'];
  response.end = ((chunk?: string | Uint8Array) => {
    if (chunk) output += typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString('utf8');
    finishRequest();
    return response;
  }) as ServerResponse['end'];
  let finishRequest!: () => void;
  const finished = new Promise<void>((resolve) => { finishRequest = resolve; });
  if (rawBody) req.push(rawBody);
  req.push(null);
  app.handle(req, response, (error?: unknown) => {
    if (error) { output = JSON.stringify({ error: { code: 'TEST_ERROR', message: String(error) } }); response.statusCode = 500; finishRequest(); }
  });
  await finished;
  const status = response.statusCode;
  return { response: { status }, data: status === 204 ? null : JSON.parse(output) };
}

test('auth, exercise catalog, workout transactions, isolation and statistics', async () => {
  const noAuth = await request('/api/v1/workouts');
  assert.equal(noAuth.response.status, 401);
  assert.equal(noAuth.data.error.code, 'UNAUTHORIZED');

  const registered = await request('/api/v1/auth/register', { method: 'POST', body: {
    email: '  Test.User@Example.com ', password: 'test-password-123', displayName: 'Тестовый пользователь',
  } });
  assert.equal(registered.response.status, 201);
  const userToken = registered.data.data.token as string;
  const userId = registered.data.data.user.id as string;
  assert.equal(registered.data.data.user.email, 'test.user@example.com');
  const duplicate = await request('/api/v1/auth/register', { method: 'POST', body: {
    email: 'TEST.USER@example.com', password: 'test-password-123', displayName: 'Повтор',
  } });
  assert.equal(duplicate.response.status, 409);

  const loggedIn = await request('/api/v1/auth/login', { method: 'POST', body: { email: 'test.user@example.com', password: 'test-password-123' } });
  assert.equal(loggedIn.response.status, 200);
  assert.equal((await request('/api/v1/auth/login', { method: 'POST', body: { email: 'test.user@example.com', password: 'wrong-password' } })).response.status, 401);
  assert.equal((await request('/api/v1/auth/me', { token: userToken })).data.data.id, userId);
  assert.equal((await request('/api/v1/auth/me', { token: 'bad.token.value' })).response.status, 401);

  const catalog = await request('/api/v1/catalog/muscle-groups');
  assert.equal(catalog.response.status, 200);
  assert(catalog.data.data.some((group: { slug: string }) => group.slug === 'chest'));
  const exerciseCreate = await request('/api/v1/exercises', { method: 'POST', token: userToken, body: {
    name: '  Тестовый жим ', description: 'Проверка API', muscleGroupSlug: 'chest', isBodyweight: false, equipmentSlugs: ['barbell', 'bench'],
  } });
  assert.equal(exerciseCreate.response.status, 201);
  const exerciseId = exerciseCreate.data.data.id as string;
  assert.equal(exerciseCreate.data.data.name, 'Тестовый жим');
  const exercisePatch = await request(`/api/v1/exercises/${exerciseId}`, { method: 'PATCH', token: userToken, body: { description: 'Обновлено' } });
  assert.equal(exercisePatch.data.data.description, 'Обновлено');

  const workoutBody = { performedOn: '2026-01-01', name: 'Силовая', notes: 'Плановая', exercises: [
    { exerciseId: 'seed-bench-press', sets: [{ reps: 2, weightKg: 72.29 }, { reps: 3, weightKg: 70 }] },
    { exerciseId, sets: [{ reps: 5, weightKg: 40 }] },
    { exerciseId: 'seed-push-ups', sets: [{ reps: 8, weightKg: 0 }] },
  ] };
  const workout = await request('/api/v1/workouts', { method: 'POST', token: userToken, body: workoutBody });
  assert.equal(workout.response.status, 201);
  const workoutId = workout.data.data.id as string;
  assert.equal(workout.data.data.exercises[0].sets[0].weightKg, 72.29);

  const badSet = await request('/api/v1/workouts', { method: 'POST', token: userToken, body: {
    ...workoutBody, exercises: [{ exerciseId: 'seed-bench-press', sets: [{ reps: 0, weightKg: 10 }] }],
  } });
  assert.equal(badSet.response.status, 400);
  const badExercise = await request('/api/v1/workouts', { method: 'POST', token: userToken, body: {
    ...workoutBody, exercises: [
      { exerciseId: 'seed-bench-press', sets: [{ reps: 1, weightKg: 10 }] },
      { exerciseId: 'does-not-exist', sets: [{ reps: 1, weightKg: 10 }] },
    ],
  } });
  assert.equal(badExercise.response.status, 400);
  const workouts = await request('/api/v1/workouts', { token: userToken });
  assert.equal(workouts.data.data.length, 1, 'failed create must roll back');

  const other = await request('/api/v1/auth/register', { method: 'POST', body: {
    email: 'other@example.com', password: 'other-password-123', displayName: 'Другой',
  } });
  const otherToken = other.data.data.token as string;
  assert.equal((await request(`/api/v1/workouts/${workoutId}`, { token: otherToken })).response.status, 404);
  assert.equal((await request(`/api/v1/exercises/${exerciseId}`, { token: otherToken })).response.status, 404);
  assert.equal((await request(`/api/v1/exercises/${exerciseId}`, { token: userToken })).response.status, 200);

  const stats = await request('/api/v1/exercises/seed-bench-press/stats?from=2026-01-01&to=2026-01-07', { token: userToken });
  assert.equal(stats.response.status, 200);
  assert.equal(stats.data.data.maxWeightKg, 72.29);
  assert.equal(stats.data.data.weekly[0].weekStart, '2025-12-29');
  assert.equal(stats.data.data.weekly[0].reps, 5);
  assert.equal(stats.data.data.weekly[0].volumeKg, 354.58);
  const muscleStats = await request('/api/v1/stats/muscle-groups?from=2026-01-01&to=2026-01-07', { token: userToken });
  assert.equal(muscleStats.response.status, 200);
  assert(muscleStats.data.data.reps.some((row: { muscleGroupSlug: string; reps: number }) => row.muscleGroupSlug === 'chest' && row.reps === 18));
  const bodyweightStats = await request('/api/v1/exercises/seed-push-ups/stats?from=2026-01-01&to=2026-01-07', { token: userToken });
  assert.equal(bodyweightStats.data.data.weekly[0].reps, 8);
  assert.equal(bodyweightStats.data.data.weekly[0].volumeKg, 0);

  const invalidPrecision = await request('/api/v1/workouts', { method: 'POST', token: userToken, body: {
    ...workoutBody, exercises: [{ exerciseId: 'seed-bench-press', sets: [{ reps: 1, weightKg: 1.001 }] }],
  } });
  assert.equal(invalidPrecision.response.status, 400);
  assert.equal((await request(`/api/v1/exercises/${exerciseId}`, { method: 'DELETE', token: userToken })).response.status, 204);
  const historicalWorkout = await request(`/api/v1/workouts/${workoutId}`, { token: userToken });
  assert(historicalWorkout.data.data.exercises.some((item: { exerciseId: string }) => item.exerciseId === exerciseId));
  assert.equal((await request(`/api/v1/exercises/${exerciseId}`, { token: userToken })).response.status, 404);
  const replace = await request(`/api/v1/workouts/${workoutId}`, { method: 'PUT', token: userToken, body: {
    ...workoutBody, name: 'Обновлённая тренировка', exercises: [{ exerciseId: 'seed-push-ups', sets: [{ reps: 8, weightKg: 0 }] }],
  } });
  assert.equal(replace.response.status, 200);
  assert.equal(replace.data.data.name, 'Обновлённая тренировка');
  assert.equal((await request('/api/v1/exercises', { token: userToken })).data.data.some((item: { id: string }) => item.id === exerciseId), false);
  assert.equal((await request(`/api/v1/workouts/${workoutId}`, { method: 'DELETE', token: userToken })).response.status, 204);
});
