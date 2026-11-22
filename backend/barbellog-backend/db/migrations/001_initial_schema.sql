-- Barbellog initial SQLite schema. Applied by `npm run db:migrate`.
BEGIN IMMEDIATE;

CREATE TABLE users (
  id TEXT PRIMARY KEY NOT NULL,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash TEXT NOT NULL CHECK (length(password_hash) > 0),
  display_name TEXT NOT NULL CHECK (length(trim(display_name)) > 0),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE muscle_groups (
  slug TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL UNIQUE,
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE equipment (
  slug TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL UNIQUE,
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE exercises (
  id TEXT PRIMARY KEY NOT NULL,
  owner_user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL CHECK (length(trim(name)) > 0),
  name_key TEXT NOT NULL CHECK (length(name_key) > 0),
  description TEXT NOT NULL DEFAULT '' CHECK (length(description) <= 5000),
  muscle_group_slug TEXT NOT NULL REFERENCES muscle_groups(slug) ON DELETE RESTRICT,
  is_bodyweight INTEGER NOT NULL DEFAULT 0 CHECK (is_bodyweight IN (0, 1)),
  archived_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE (id, owner_user_id)
);
CREATE UNIQUE INDEX exercises_system_name_active_uq
  ON exercises (name_key) WHERE owner_user_id IS NULL AND archived_at IS NULL;
CREATE UNIQUE INDEX exercises_personal_name_active_uq
  ON exercises (owner_user_id, name_key)
  WHERE owner_user_id IS NOT NULL AND archived_at IS NULL;
CREATE INDEX exercises_catalog_idx
  ON exercises (owner_user_id, muscle_group_slug, name_key)
  WHERE archived_at IS NULL;

CREATE TABLE exercise_equipment (
  exercise_id TEXT NOT NULL REFERENCES exercises(id) ON DELETE CASCADE,
  equipment_slug TEXT NOT NULL REFERENCES equipment(slug) ON DELETE RESTRICT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  PRIMARY KEY (exercise_id, equipment_slug)
);
CREATE INDEX exercise_equipment_equipment_idx ON exercise_equipment (equipment_slug);

CREATE TABLE workouts (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  performed_on TEXT NOT NULL CHECK (
    length(performed_on) = 10 AND date(performed_on) = performed_on
  ),
  name TEXT NOT NULL CHECK (length(trim(name)) > 0 AND length(name) <= 160),
  notes TEXT NOT NULL DEFAULT '' CHECK (length(notes) <= 10000),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE (id, user_id)
);
CREATE INDEX workouts_user_date_idx ON workouts (user_id, performed_on DESC, id);

CREATE TABLE workout_exercises (
  id TEXT PRIMARY KEY NOT NULL,
  workout_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  exercise_id TEXT NOT NULL,
  exercise_owner_user_id TEXT,
  position INTEGER NOT NULL CHECK (position > 0),
  exercise_name_snapshot TEXT NOT NULL CHECK (length(trim(exercise_name_snapshot)) > 0),
  muscle_group_slug_snapshot TEXT NOT NULL REFERENCES muscle_groups(slug) ON DELETE RESTRICT,
  is_bodyweight_snapshot INTEGER NOT NULL CHECK (is_bodyweight_snapshot IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  CHECK (exercise_owner_user_id IS NULL OR exercise_owner_user_id = user_id),
  FOREIGN KEY (workout_id, user_id) REFERENCES workouts(id, user_id) ON DELETE CASCADE,
  FOREIGN KEY (exercise_id, exercise_owner_user_id)
    REFERENCES exercises(id, owner_user_id) ON DELETE RESTRICT,
  UNIQUE (id, user_id),
  UNIQUE (workout_id, position)
);
CREATE INDEX workout_exercises_exercise_idx
  ON workout_exercises (user_id, exercise_id, workout_id);

CREATE TABLE workout_sets (
  id TEXT PRIMARY KEY NOT NULL,
  workout_exercise_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  position INTEGER NOT NULL CHECK (position > 0),
  -- Exact 0.01 kg increments: 72.50 kg is stored as 7250.
  weight_centi_kg INTEGER NOT NULL DEFAULT 0 CHECK (weight_centi_kg >= 0),
  reps INTEGER NOT NULL CHECK (reps > 0 AND reps <= 32767),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  FOREIGN KEY (workout_exercise_id, user_id)
    REFERENCES workout_exercises(id, user_id) ON DELETE CASCADE,
  UNIQUE (workout_exercise_id, position)
);
CREATE INDEX workout_sets_exercise_owner_idx
  ON workout_sets (user_id, workout_exercise_id);

CREATE TRIGGER users_set_updated_at
AFTER UPDATE ON users
FOR EACH ROW WHEN NEW.updated_at = OLD.updated_at
BEGIN
  UPDATE users SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = NEW.id;
END;

CREATE TRIGGER exercises_set_updated_at
AFTER UPDATE ON exercises
FOR EACH ROW WHEN NEW.updated_at = OLD.updated_at
BEGIN
  UPDATE exercises SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = NEW.id;
END;

CREATE TRIGGER workouts_set_updated_at
AFTER UPDATE ON workouts
FOR EACH ROW WHEN NEW.updated_at = OLD.updated_at
BEGIN
  UPDATE workouts SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = NEW.id;
END;

-- SQLite has no row-level security. Enforce that only shared or caller-owned active
-- exercises are attached to a workout; user_id is also part of the workout FK.
CREATE TRIGGER workout_exercises_check_available
BEFORE INSERT ON workout_exercises
FOR EACH ROW
WHEN NOT EXISTS (
  SELECT 1
  FROM exercises e
  WHERE e.id = NEW.exercise_id
    AND e.owner_user_id IS NEW.exercise_owner_user_id
    AND e.archived_at IS NULL
    AND (e.owner_user_id IS NULL OR e.owner_user_id = NEW.user_id)
)
BEGIN
  SELECT RAISE(ABORT, 'exercise is not available for this workout');
END;

CREATE TRIGGER workout_exercises_update_check_available
BEFORE UPDATE OF exercise_id, exercise_owner_user_id, user_id ON workout_exercises
FOR EACH ROW
WHEN NOT EXISTS (
  SELECT 1
  FROM exercises e
  WHERE e.id = NEW.exercise_id
    AND e.owner_user_id IS NEW.exercise_owner_user_id
    AND e.archived_at IS NULL
    AND (e.owner_user_id IS NULL OR e.owner_user_id = NEW.user_id)
)
BEGIN
  SELECT RAISE(ABORT, 'exercise is not available for this workout');
END;

INSERT INTO muscle_groups (slug, name, sort_order) VALUES
  ('chest', 'Грудь', 10),
  ('back', 'Спина', 20),
  ('shoulders', 'Плечи', 30),
  ('biceps', 'Бицепс', 40),
  ('triceps', 'Трицепс', 50),
  ('quadriceps', 'Квадрицепсы', 60),
  ('hamstrings', 'Бицепс бедра', 70),
  ('glutes', 'Ягодицы', 80),
  ('calves', 'Икры', 90),
  ('core', 'Мышцы кора', 100),
  ('full_body', 'Всё тело', 110);

INSERT INTO equipment (slug, name, sort_order) VALUES
  ('barbell', 'Штанга', 10),
  ('dumbbell', 'Гантели', 20),
  ('cable', 'Блок', 30),
  ('machine', 'Тренажёр', 40),
  ('bodyweight', 'Собственный вес', 50),
  ('kettlebell', 'Гиря', 60),
  ('resistance_band', 'Резиновая лента', 70),
  ('bench', 'Скамья', 80),
  ('pullup_bar', 'Турник', 90);

INSERT INTO exercises (id, owner_user_id, name, name_key, description, muscle_group_slug, is_bodyweight)
VALUES
  ('seed-bench-press', NULL, 'Жим штанги лёжа', 'жим штанги лёжа', 'Базовое жимовое упражнение.', 'chest', 0),
  ('seed-push-ups', NULL, 'Отжимания', 'отжимания', 'Отжимания от пола.', 'chest', 1),
  ('seed-squat', NULL, 'Приседания со штангой', 'приседания со штангой', 'Приседания со штангой на спине.', 'quadriceps', 0),
  ('seed-deadlift', NULL, 'Становая тяга', 'становая тяга', 'Классическая становая тяга.', 'back', 0),
  ('seed-overhead-press', NULL, 'Жим штанги стоя', 'жим штанги стоя', 'Жим штанги над головой.', 'shoulders', 0),
  ('seed-pull-ups', NULL, 'Подтягивания', 'подтягивания', 'Подтягивания на перекладине.', 'back', 1),
  ('seed-dumbbell-row', NULL, 'Тяга гантели в наклоне', 'тяга гантели в наклоне', 'Тяга гантели одной рукой.', 'back', 0),
  ('seed-curl', NULL, 'Сгибания рук с гантелями', 'сгибания рук с гантелями', 'Сгибание рук на бицепс.', 'biceps', 0),
  ('seed-triceps-pushdown', NULL, 'Разгибания рук на блоке', 'разгибания рук на блоке', 'Разгибание рук на верхнем блоке.', 'triceps', 0),
  ('seed-glute-bridge', NULL, 'Ягодичный мост', 'ягодичный мост', 'Разгибание таза лёжа.', 'glutes', 1);

INSERT INTO exercise_equipment (exercise_id, equipment_slug) VALUES
  ('seed-bench-press', 'barbell'), ('seed-bench-press', 'bench'),
  ('seed-push-ups', 'bodyweight'),
  ('seed-squat', 'barbell'), ('seed-deadlift', 'barbell'),
  ('seed-overhead-press', 'barbell'), ('seed-pull-ups', 'pullup_bar'),
  ('seed-dumbbell-row', 'dumbbell'), ('seed-curl', 'dumbbell'),
  ('seed-triceps-pushdown', 'cable'), ('seed-glute-bridge', 'bodyweight');

INSERT INTO schema_migrations (version) VALUES ('001_initial_schema');

COMMIT;
