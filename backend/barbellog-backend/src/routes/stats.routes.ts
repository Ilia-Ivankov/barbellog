import { Router } from 'express';
import { getDatabase } from '../db/database.js';
import { requireAuth, userId } from '../middlewares/auth.middleware.js';
import { asyncRoute, validDate } from '../utils/http.js';

const router = Router();
router.get('/muscle-groups', requireAuth, asyncRoute((req, res) => {
  const ownerId = userId(req);
  const from = req.query.from === undefined ? null : validDate(req.query.from, 'from');
  const to = req.query.to === undefined ? null : validDate(req.query.to, 'to');
  const db = getDatabase();
  const filter = `we.user_id = ? AND (? IS NULL OR w.performed_on >= ?) AND (? IS NULL OR w.performed_on <= ?)`;
  const params = [ownerId, from, from, to, to];
  const reps = db.prepare(`SELECT we.muscle_group_slug_snapshot AS muscleGroupSlug, m.name AS muscleGroup,
      SUM(ws.reps) AS reps
    FROM workout_exercises we JOIN workouts w ON w.id = we.workout_id AND w.user_id = we.user_id
    JOIN workout_sets ws ON ws.workout_exercise_id = we.id AND ws.user_id = we.user_id
    JOIN muscle_groups m ON m.slug = we.muscle_group_slug_snapshot
    WHERE ${filter} GROUP BY we.muscle_group_slug_snapshot ORDER BY m.sort_order, m.name`).all(...params);
  const weeklyVolume = db.prepare(`SELECT we.muscle_group_slug_snapshot AS muscleGroupSlug,
      date(w.performed_on, '-' || ((CAST(strftime('%w', w.performed_on) AS INTEGER) + 6) % 7) || ' days') AS weekStart,
      SUM(ws.weight_centi_kg * ws.reps) / 100.0 AS volumeKg
    FROM workout_exercises we JOIN workouts w ON w.id = we.workout_id AND w.user_id = we.user_id
    JOIN workout_sets ws ON ws.workout_exercise_id = we.id AND ws.user_id = we.user_id
    WHERE ${filter} GROUP BY we.muscle_group_slug_snapshot, weekStart ORDER BY weekStart, muscleGroupSlug`).all(...params);
  res.json({ data: { reps, weeklyVolume } });
}));
export default router;
