export const API_BASE = import.meta.env.VITE_API_BASE_URL || '/api/v1'
const SESSION_KEY = 'barbellog.session'

export type User = { id: string; email: string; displayName: string }
export type MuscleGroup = { slug: string; name: string; sortOrder: number }
export type Equipment = { slug: string; name: string; sortOrder: number }
export type Exercise = {
  id: string; name: string; description: string; muscleGroup: MuscleGroup; isBodyweight: boolean
  isCustom: boolean; archivedAt: string | null; equipment: Equipment[]
}
export type Set = { id?: string; position?: number; reps: number; weightKg: number }
export type WorkoutExercise = { id?: string; exerciseId: string; position?: number; name: string; muscleGroupSlug: string; isBodyweight: boolean; sets: Set[] }
export type Workout = { id: string; performedOn: string; name: string; notes: string; createdAt: string; updatedAt: string; exercises: WorkoutExercise[] }
export type ExerciseStats = { maxWeightKg: number; maxByDate: { date: string; weightKg: number }[]; weekly: { weekStart: string; volumeKg: number; reps: number }[] }
export type MuscleStats = { reps: { muscleGroupSlug: string; muscleGroup: string; reps: number }[]; weeklyVolume: { muscleGroupSlug: string; weekStart: string; volumeKg: number }[] }

export type Session = { token: string; user: User }
export function getSession(): Session | null {
  try { const value = localStorage.getItem(SESSION_KEY); return value ? JSON.parse(value) as Session : null } catch { return null }
}
export function saveSession(session: Session) { localStorage.setItem(SESSION_KEY, JSON.stringify(session)) }
export function clearSession() { localStorage.removeItem(SESSION_KEY) }

export class ApiError extends Error {
  status: number
  constructor(message: string, status: number) { super(message); this.status = status }
}
export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const session = getSession()
  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...(session ? { Authorization: `Bearer ${session.token}` } : {}), ...options.headers },
  })
  if (response.status === 204) return undefined as T
  let body: { data?: T; error?: { message?: string } }
  try { body = await response.json() as typeof body } catch { throw new ApiError('Сервер вернул некорректный ответ', response.status) }
  if (!response.ok) throw new ApiError(body.error?.message || 'Не удалось выполнить запрос', response.status)
  return body.data as T
}
export function query(values: Record<string, string | undefined>) {
  const params = new URLSearchParams()
  Object.entries(values).forEach(([key, value]) => { if (value) params.set(key, value) })
  const result = params.toString()
  return result ? `?${result}` : ''
}
