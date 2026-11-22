import { Router } from 'express';
import { getDatabase } from '../db/database.js';

const router = Router();
router.get('/muscle-groups', (_req, res) => {
  const rows = getDatabase().prepare('SELECT slug, name, sort_order AS sortOrder FROM muscle_groups ORDER BY sort_order, name').all();
  res.json({ data: rows });
});
router.get('/equipment', (_req, res) => {
  const rows = getDatabase().prepare('SELECT slug, name, sort_order AS sortOrder FROM equipment ORDER BY sort_order, name').all();
  res.json({ data: rows });
});
export default router;
