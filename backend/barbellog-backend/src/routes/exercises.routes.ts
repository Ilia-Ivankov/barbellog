import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import { getDatabase, withUserContext } from '../db/database.js';
import { requireAuth, userId } from '../middlewares/auth.middleware.js';
import { asyncRoute, fail, optionalString, requiredString, routeParam, validDate } from '../utils/http.js';
import type { SQLInputValue } from 'node:sqlite';

const router = Router();
type ExerciseRow = {
  id: string; owner_user_id: string | null; name: string; description: string; muscle_group_slug: string;
  muscle_group_name: string; is_bodyweight: number; archived_at: string | null;
};

function readExercise(id: string, ownerId: string) {
  const db = getDatabase();
  const row = db.prepare(`SELECT e.id, e.owner_user_id, e.name, e.description, e.muscle_group_slug,
      m.name AS muscle_group_name, e.is_bodyweight, e.archived_at
    FROM exercises e JOIN muscle_groups m ON m.slug = e.muscle_group_slug
    WHERE e.id = ? AND (e.owner_user_id IS NULL OR e.owner_user_id = ?)`)
    .get(id, ownerId) as ExerciseRow | undefined;
  if (!row) fail(404, 'NOT_FOUND', 'Упражнение не найдено');
  const equipment = db.prepare(`SELECT ee.equipment_slug AS slug, e.name
    FROM exercise_equipment ee JOIN equipment e ON e.slug = ee.equipment_slug
    WHERE ee.exercise_id = ? ORDER BY e.sort_order, e.name`).all(id);
  return { id: row.id, name: row.name, description: row.description, muscleGroup: { slug: row.muscle_group_slug, name: row.muscle_group_name },
    isBodyweight: Boolean(row.is_bodyweight), isCustom: row.owner_user_id !== null, archivedAt: row.archived_at, equipment };
}

function validateExerciseFields(input: Record<string, unknown>, partial = false) {
  const fields: Record<string, unknown> = {};
  if (!partial || input.name !== undefined) fields.name = requiredString(input.name, 'name', 160);
  if (!partial || input.description !== undefined) fields.description = optionalString(input.description, 'description', 5000);
  if (!partial || input.muscleGroupSlug !== undefined) fields.muscleGroupSlug = requiredString(input.muscleGroupSlug, 'muscleGroupSlug', 80);
  if (!partial || input.isBodyweight !== undefined) {
    if (typeof input.isBodyweight !== 'boolean') fail(400, 'VALIDATION_ERROR', 'isBodyweight: ожидается boolean');
    fields.isBodyweight = input.isBodyweight;
  }
  if (!partial || input.equipmentSlugs !== undefined) {
    if (!Array.isArray(input.equipmentSlugs) || input.equipmentSlugs.some((slug) => typeof slug !== 'string')) {
      fail(400, 'VALIDATION_ERROR', 'equipmentSlugs: ожидается список идентификаторов');
    }
    fields.equipmentSlugs = [...new Set(input.equipmentSlugs.map((slug) => (slug as string).trim()))];
  }
  return fields as { name?: string; description?: string; muscleGroupSlug?: string; isBodyweight?: boolean; equipmentSlugs?: string[] };
}

function checkReferences(muscleGroupSlug: string, equipmentSlugs: string[]) {
  const db = getDatabase();
  if (!db.prepare('SELECT 1 FROM muscle_groups WHERE slug = ?').get(muscleGroupSlug)) fail(400, 'VALIDATION_ERROR', 'Неизвестная группа мышц');
  if (equipmentSlugs.length) {
    const known = db.prepare(`SELECT slug FROM equipment WHERE slug IN (${equipmentSlugs.map(() => '?').join(',')})`).all(...equipmentSlugs) as { slug: string }[];
    if (known.length !== equipmentSlugs.length) fail(400, 'VALIDATION_ERROR', 'Список оборудования содержит неизвестные значения');
  }
}

router.get('/', requireAuth, asyncRoute((req, res) => {
  const ownerId = userId(req);
  const group = typeof req.query.muscleGroup === 'string' ? req.query.muscleGroup : undefined;
  const search = typeof req.query.search === 'string' ? `%${req.query.search.normalize('NFKC').trim()}%` : undefined;
  const db = getDatabase();
  const rows = db.prepare(`SELECT e.id FROM exercises e WHERE e.archived_at IS NULL
    AND (e.owner_user_id IS NULL OR e.owner_user_id = ?)
    AND (? IS NULL OR e.muscle_group_slug = ?) AND (? IS NULL OR e.name LIKE ?)
    ORDER BY e.name_key, e.id`).all(ownerId, group ?? null, group ?? null, search ?? null, search ?? null) as { id: string }[];
  res.json({ data: rows.map(({ id }) => readExercise(id, ownerId)) });
}));

router.get('/:id', requireAuth, asyncRoute((req, res) => {
  const ownerId = userId(req);
  const id = routeParam(req, 'id');
  const active = getDatabase().prepare(`SELECT 1 FROM exercises WHERE id = ? AND archived_at IS NULL
    AND (owner_user_id IS NULL OR owner_user_id = ?)`).get(id, ownerId);
  if (!active) fail(404, 'NOT_FOUND', 'Упражнение не найдено');
  res.json({ data: readExercise(id, ownerId) });
}));

router.post('/', requireAuth, asyncRoute((req, res) => {
  const ownerId = userId(req);
  const input = validateExerciseFields(req.body ?? {});
  checkReferences(input.muscleGroupSlug!, input.equipmentSlugs!);
  const id: string = randomUUID();
  withUserContext(ownerId, (db) => {
    const values: SQLInputValue[] = [id, ownerId, input.name!, input.name!.normalize('NFKC').trim().toLowerCase(), input.description!, input.muscleGroupSlug!, Number(input.isBodyweight)];
    db.prepare(`INSERT INTO exercises (id, owner_user_id, name, name_key, description, muscle_group_slug, is_bodyweight)
      VALUES (?, ?, ?, ?, ?, ?, ?)`)
      .run(...values);
    const insert = db.prepare('INSERT INTO exercise_equipment (exercise_id, equipment_slug) VALUES (?, ?)');
    for (const slug of input.equipmentSlugs!) insert.run(id, slug);
  });
  res.status(201).json({ data: readExercise(id, ownerId) });
}));

router.patch('/:id', requireAuth, asyncRoute((req, res) => {
  const ownerId = userId(req);
  const id = routeParam(req, 'id');
  const current = getDatabase().prepare('SELECT id FROM exercises WHERE id = ? AND owner_user_id = ? AND archived_at IS NULL').get(id, ownerId);
  if (!current) fail(404, 'NOT_FOUND', 'Личное упражнение не найдено');
  const input = validateExerciseFields(req.body ?? {}, true);
  if (input.muscleGroupSlug) checkReferences(input.muscleGroupSlug, input.equipmentSlugs ?? []);
  if (input.equipmentSlugs && !input.muscleGroupSlug) {
    const group = getDatabase().prepare('SELECT muscle_group_slug AS slug FROM exercises WHERE id = ?').get(id) as { slug: string };
    checkReferences(group.slug, input.equipmentSlugs);
  }
  withUserContext(ownerId, (db) => {
    const columns: string[] = [];
    const values: SQLInputValue[] = [];
    if (input.name !== undefined) { columns.push('name = ?', 'name_key = ?'); values.push(input.name, input.name.normalize('NFKC').trim().toLowerCase()); }
    if (input.description !== undefined) { columns.push('description = ?'); values.push(input.description); }
    if (input.muscleGroupSlug !== undefined) { columns.push('muscle_group_slug = ?'); values.push(input.muscleGroupSlug); }
    if (input.isBodyweight !== undefined) { columns.push('is_bodyweight = ?'); values.push(Number(input.isBodyweight)); }
    if (columns.length) db.prepare(`UPDATE exercises SET ${columns.join(', ')} WHERE id = ? AND owner_user_id = ?`).run(...values, id, ownerId);
    if (input.equipmentSlugs !== undefined) {
      db.prepare('DELETE FROM exercise_equipment WHERE exercise_id = ?').run(id);
      const insert = db.prepare('INSERT INTO exercise_equipment (exercise_id, equipment_slug) VALUES (?, ?)');
      for (const slug of input.equipmentSlugs) insert.run(id, slug);
    }
  });
  res.json({ data: readExercise(id, ownerId) });
}));

router.delete('/:id', requireAuth, asyncRoute((req, res) => {
  const ownerId = userId(req);
  const result = getDatabase().prepare(`UPDATE exercises SET archived_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
    WHERE id = ? AND owner_user_id = ? AND archived_at IS NULL`).run(routeParam(req, 'id'), ownerId);
  if (!result.changes) fail(404, 'NOT_FOUND', 'Личное упражнение не найдено');
  res.status(204).end();
}));

router.get('/:id/stats', requireAuth, asyncRoute((req, res) => {
  const ownerId = userId(req);
  const id = routeParam(req, 'id');
  const exercise = getDatabase().prepare('SELECT id FROM exercises WHERE id = ? AND (owner_user_id IS NULL OR owner_user_id = ?)').get(id, ownerId);
  if (!exercise) fail(404, 'NOT_FOUND', 'Упражнение не найдено');
  const from = typeof req.query.from === 'string' ? req.query.from : null;
  const to = typeof req.query.to === 'string' ? req.query.to : null;
  if (from) validDate(from, 'from');
  if (to) validDate(to, 'to');
  if (from && to && from > to) fail(400, 'VALIDATION_ERROR', 'from не может быть позже to');
  const db = getDatabase();
  const filter = `we.user_id = ? AND we.exercise_id = ? AND (? IS NULL OR w.performed_on >= ?) AND (? IS NULL OR w.performed_on <= ?)`;
  const params = [ownerId, id, from, from, to, to];
  const maxByDate = db.prepare(`SELECT w.performed_on AS date, MAX(ws.weight_centi_kg) / 100.0 AS weightKg
    FROM workouts w JOIN workout_exercises we ON we.workout_id = w.id JOIN workout_sets ws ON ws.workout_exercise_id = we.id
    WHERE ${filter} GROUP BY w.performed_on ORDER BY w.performed_on`).all(...params);
  const weekly = db.prepare(`SELECT date(w.performed_on, '-' || ((CAST(strftime('%w', w.performed_on) AS INTEGER) + 6) % 7) || ' days') AS weekStart,
      SUM(ws.weight_centi_kg * ws.reps) / 100.0 AS volumeKg, SUM(ws.reps) AS reps
    FROM workouts w JOIN workout_exercises we ON we.workout_id = w.id JOIN workout_sets ws ON ws.workout_exercise_id = we.id
    WHERE ${filter} GROUP BY weekStart ORDER BY weekStart`).all(...params) as { weekStart: string; volumeKg: number; reps: number }[];
  res.json({ data: { maxWeightKg: Math.max(0, ...(maxByDate as { weightKg: number }[]).map((row) => row.weightKg)), maxByDate,
    weekly: weekly.map((row) => ({ ...row, volumeKg: Number(row.volumeKg) })) } });
}));

export default router;
