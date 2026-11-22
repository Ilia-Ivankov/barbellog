import { randomUUID } from 'node:crypto';
import { Router, type Request, type Response } from 'express';
import type { DatabaseSync } from 'node:sqlite';
import { getDatabase, withUserContext } from '../db/database.js';
import { requireAuth, userId } from '../middlewares/auth.middleware.js';
import { asyncRoute, fail, optionalString, requiredString, routeParam, validDate } from '../utils/http.js';

const router = Router();
type SetInput = { reps: number; weightKg: number };
type ExerciseInput = { exerciseId: string; sets: SetInput[] };
type WorkoutInput = { performedOn: string; name: string; notes: string; exercises: ExerciseInput[] };

function parseWorkout(body: Record<string, unknown>): WorkoutInput {
  const performedOn = validDate(body.performedOn, 'performedOn');
  const name = requiredString(body.name, 'name', 160);
  const notes = optionalString(body.notes, 'notes', 10000);
  if (!Array.isArray(body.exercises) || body.exercises.length === 0) fail(400, 'VALIDATION_ERROR', 'Добавьте хотя бы одно упражнение');
  const exercises = body.exercises.map((raw, exerciseIndex) => {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) fail(400, 'VALIDATION_ERROR', `exercises[${exerciseIndex}]: некорректный объект`);
    const exercise = raw as Record<string, unknown>;
    const exerciseId = requiredString(exercise.exerciseId, `exercises[${exerciseIndex}].exerciseId`, 100);
    if (!Array.isArray(exercise.sets) || exercise.sets.length === 0) fail(400, 'VALIDATION_ERROR', `exercises[${exerciseIndex}]: добавьте хотя бы один подход`);
    const sets = exercise.sets.map((rawSet, setIndex) => {
      if (!rawSet || typeof rawSet !== 'object' || Array.isArray(rawSet)) fail(400, 'VALIDATION_ERROR', `sets[${setIndex}]: некорректный объект`);
      const set = rawSet as Record<string, unknown>;
      if (!Number.isInteger(set.reps) || (set.reps as number) < 1 || (set.reps as number) > 32767) fail(400, 'VALIDATION_ERROR', 'reps должен быть целым числом от 1 до 32767');
      if (typeof set.weightKg !== 'number' || !Number.isFinite(set.weightKg) || set.weightKg < 0 ||
        !Number.isSafeInteger(Math.round(set.weightKg * 100)) || Math.abs(set.weightKg * 100 - Math.round(set.weightKg * 100)) > 1e-7) {
        fail(400, 'VALIDATION_ERROR', 'weightKg должен быть неотрицательным числом с точностью до 0,01 кг');
      }
      return { reps: set.reps as number, weightKg: set.weightKg };
    });
    return { exerciseId, sets };
  });
  return { performedOn, name, notes, exercises };
}

function insertChildren(db: DatabaseSync, workoutId: string, ownerId: string, exercises: ExerciseInput[]) {
  const findExercise = db.prepare(`SELECT id, owner_user_id, name, muscle_group_slug, is_bodyweight
    FROM exercises WHERE id = ? AND archived_at IS NULL AND (owner_user_id IS NULL OR owner_user_id = ?)`);
  const insertExercise = db.prepare(`INSERT INTO workout_exercises
    (id, workout_id, user_id, exercise_id, exercise_owner_user_id, position, exercise_name_snapshot, muscle_group_slug_snapshot, is_bodyweight_snapshot)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  const insertSet = db.prepare(`INSERT INTO workout_sets (id, workout_exercise_id, user_id, position, weight_centi_kg, reps)
    VALUES (?, ?, ?, ?, ?, ?)`);
  exercises.forEach((item, index) => {
    const exercise = findExercise.get(item.exerciseId, ownerId) as {
      id: string; owner_user_id: string | null; name: string; muscle_group_slug: string; is_bodyweight: number;
    } | undefined;
    if (!exercise) fail(400, 'INVALID_EXERCISE', 'Упражнение недоступно для этой тренировки');
    const workoutExerciseId = randomUUID();
    insertExercise.run(workoutExerciseId, workoutId, ownerId, exercise.id, exercise.owner_user_id, index + 1,
      exercise.name, exercise.muscle_group_slug, exercise.is_bodyweight);
    item.sets.forEach((set, setIndex) => insertSet.run(randomUUID(), workoutExerciseId, ownerId, setIndex + 1, Math.round(set.weightKg * 100), set.reps));
  });
}

function readWorkout(id: string, ownerId: string) {
  const db = getDatabase();
  const workout = db.prepare(`SELECT id, performed_on AS performedOn, name, notes, created_at AS createdAt, updated_at AS updatedAt
    FROM workouts WHERE id = ? AND user_id = ?`).get(id, ownerId) as
    { id: string; performedOn: string; name: string; notes: string; createdAt: string; updatedAt: string } | undefined;
  if (!workout) fail(404, 'NOT_FOUND', 'Тренировка не найдена');
  const exercises = db.prepare(`SELECT we.id, we.exercise_id AS exerciseId, we.position, we.exercise_name_snapshot AS name,
      we.muscle_group_slug_snapshot AS muscleGroupSlug, we.is_bodyweight_snapshot AS isBodyweight
    FROM workout_exercises we WHERE we.workout_id = ? AND we.user_id = ? ORDER BY we.position`).all(id, ownerId) as
    { id: string; exerciseId: string; position: number; name: string; muscleGroupSlug: string; isBodyweight: number }[];
  return { ...workout, exercises: exercises.map((exercise) => ({ ...exercise, isBodyweight: Boolean(exercise.isBodyweight),
    sets: db.prepare(`SELECT id, position, weight_centi_kg / 100.0 AS weightKg, reps FROM workout_sets
      WHERE workout_exercise_id = ? AND user_id = ? ORDER BY position`).all(exercise.id, ownerId) })) };
}

router.get('/', requireAuth, asyncRoute((req, res) => {
  const ownerId = userId(req);
  const from = req.query.from === undefined ? null : validDate(req.query.from, 'from');
  const to = req.query.to === undefined ? null : validDate(req.query.to, 'to');
  if (from && to && from > to) fail(400, 'VALIDATION_ERROR', 'from не может быть позже to');
  const db = getDatabase();
  const rows = db.prepare(`SELECT id FROM workouts WHERE user_id = ? AND (? IS NULL OR performed_on >= ?)
    AND (? IS NULL OR performed_on <= ?) ORDER BY performed_on DESC, created_at DESC`).all(ownerId, from, from, to, to) as { id: string }[];
  res.json({ data: rows.map(({ id }) => readWorkout(id, ownerId)) });
}));

router.get('/:id', requireAuth, asyncRoute((req, res) => res.json({ data: readWorkout(routeParam(req, 'id'), userId(req)) })));

function saveWorkout(req: Request, res: Response, replace: boolean) {
  const ownerId = userId(req);
  const input = parseWorkout(req.body ?? {});
  const id = replace ? routeParam(req, 'id') : randomUUID();
  withUserContext(ownerId, (db) => {
    if (replace) {
      const existing = db.prepare('SELECT 1 FROM workouts WHERE id = ? AND user_id = ?').get(id, ownerId);
      if (!existing) fail(404, 'NOT_FOUND', 'Тренировка не найдена');
      db.prepare('UPDATE workouts SET performed_on = ?, name = ?, notes = ? WHERE id = ? AND user_id = ?')
        .run(input.performedOn, input.name, input.notes, id, ownerId);
      db.prepare('DELETE FROM workout_exercises WHERE workout_id = ? AND user_id = ?').run(id, ownerId);
    } else {
      db.prepare('INSERT INTO workouts (id, user_id, performed_on, name, notes) VALUES (?, ?, ?, ?, ?)')
        .run(id, ownerId, input.performedOn, input.name, input.notes);
    }
    insertChildren(db, id, ownerId, input.exercises);
  });
  res.status(replace ? 200 : 201).json({ data: readWorkout(id, ownerId) });
}

router.post('/', requireAuth, asyncRoute((req, res) => saveWorkout(req, res, false)));
router.put('/:id', requireAuth, asyncRoute((req, res) => saveWorkout(req, res, true)));
router.delete('/:id', requireAuth, asyncRoute((req, res) => {
  const ownerId = userId(req);
  const result = getDatabase().prepare('DELETE FROM workouts WHERE id = ? AND user_id = ?').run(routeParam(req, 'id'), ownerId);
  if (!result.changes) fail(404, 'NOT_FOUND', 'Тренировка не найдена');
  res.status(204).end();
}));

export default router;
