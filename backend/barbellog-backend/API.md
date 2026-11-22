# Barbellog API

Base path: `/api/v1`. JSON responses wrap successful payloads in `data`; errors use `{ "error": { "code": "...", "message": "..." } }`.

## Authentication

- `POST /auth/register` — `{ "email", "password", "displayName" }`
- `POST /auth/login` — `{ "email", "password" }`
- `GET /auth/me` — current account

Register and login return `{ data: { user, token } }`. Send the token as `Authorization: Bearer <token>`. Tokens expire after seven days.

## Catalog and exercises

- `GET /catalog/muscle-groups`, `GET /catalog/equipment`
- `GET /exercises?muscleGroup=chest&search=жим` — active shared and personal exercises
- `GET /exercises/:id` — one active shared or personal exercise
- `POST /exercises` — create a personal exercise with `name`, `description`, `muscleGroupSlug`, `isBodyweight`, and `equipmentSlugs`
- `PATCH /exercises/:id` — update supplied fields on a personal exercise
- `DELETE /exercises/:id` — archive a personal exercise
- `GET /exercises/:id/stats?from=YYYY-MM-DD&to=YYYY-MM-DD` — maximum weight and date/weekly series

## Workouts and statistics

- `GET /workouts?from=YYYY-MM-DD&to=YYYY-MM-DD`, `GET /workouts/:id`
- `POST /workouts`, `PUT /workouts/:id` — full workout body, including the complete exercise and set lists
- `DELETE /workouts/:id`
- `GET /stats/muscle-groups?from=YYYY-MM-DD&to=YYYY-MM-DD`

Workout body example:

```json
{
  "performedOn": "2026-11-21",
  "name": "Верх тела",
  "notes": "",
  "exercises": [
    {
      "exerciseId": "seed-bench-press",
      "sets": [{ "reps": 8, "weightKg": 60.5 }]
    }
  ]
}
```

Weights use kilograms in the API and are stored in exact 0.01 kg increments. Workout writes replace nested exercises and sets in a single transaction. Dates are calendar dates in `YYYY-MM-DD` format.

## Local setup

Copy `.env.example` to `.env`, set a private `JWT_SECRET`, then run:

```powershell
npm run db:migrate
npm run dev
```

The existing SQLite schema is used unchanged. Set `FRONTEND_ORIGIN` to the exact frontend origin when it differs from Vite's default.
