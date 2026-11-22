import express from 'express';
import ENV from './config/env.config.js';
import authRoutes from './routes/auth.routes.js';
import catalogRoutes from './routes/catalog.routes.js';
import exerciseRoutes from './routes/exercises.routes.js';
import statsRoutes from './routes/stats.routes.js';
import workoutRoutes from './routes/workouts.routes.js';
import { errorHandler } from './utils/http.js';

const app = express();
app.disable('x-powered-by');
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', ENV.FRONTEND_ORIGIN);
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
  if (req.method === 'OPTIONS') { res.status(204).end(); return; }
  next();
});
app.use(express.json({ limit: '100kb' }));
app.get('/', (_req, res) => res.json({ name: 'Barbellog API', version: '1.0' }));
app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/catalog', catalogRoutes);
app.use('/api/v1/exercises', exerciseRoutes);
app.use('/api/v1/workouts', workoutRoutes);
app.use('/api/v1/stats', statsRoutes);
app.use((_req, res) => res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Маршрут не найден' } }));
app.use(errorHandler);

export default app;
