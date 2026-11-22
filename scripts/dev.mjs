import { spawn } from 'node:child_process'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const npmCli = process.env.npm_execpath

if (!npmCli) {
  console.error('Запустите эту команду через npm run dev из корня проекта.')
  process.exit(1)
}

function runNpm(args, options = {}) {
  return spawn(process.execPath, [npmCli, ...args], {
    cwd: root,
    stdio: 'inherit',
    windowsHide: true,
    ...options,
  })
}

console.log('Проверяю схему базы данных…')
const migration = runNpm(['--prefix', 'backend/barbellog-backend', 'run', 'db:migrate'])
const migrationResult = await new Promise((resolveResult, reject) => {
  migration.once('error', reject)
  migration.once('close', (code, signal) => resolveResult({ code, signal }))
})

if (migrationResult.code !== 0) {
  const reason = migrationResult.signal
    ? `сигнал ${migrationResult.signal}`
    : `код ${migrationResult.code ?? 'неизвестен'}`
  console.error(`Миграция завершилась с ошибкой (${reason}).`)
  process.exit(migrationResult.code || 1)
}

const services = [
  { name: 'API', args: ['--prefix', 'backend/barbellog-backend', 'run', 'dev'] },
  { name: 'WEB', args: ['--prefix', 'frontend/barbellog-frontend', 'run', 'dev'] },
]
const children = new Set()
let stopping = false
let exitCode = 0

function stopAll(code = 0) {
  if (stopping) return
  stopping = true
  exitCode = code
  for (const child of children) {
    if (process.platform === 'win32' && child.pid) {
      const killer = spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], {
        stdio: 'ignore',
        windowsHide: true,
      })
      killer.unref()
    } else if (child.pid) {
      try { process.kill(-child.pid, 'SIGTERM') } catch { child.kill('SIGTERM') }
    }
  }
  if (children.size === 0) process.exit(exitCode)
}

process.on('SIGINT', () => stopAll(0))
process.on('SIGTERM', () => stopAll(0))

for (const service of services) {
  const child = runNpm(service.args, { detached: process.platform !== 'win32' })
  children.add(child)
  console.log(`Запускаю ${service.name}…`)
  child.once('error', (error) => {
    console.error(`Не удалось запустить ${service.name}:`, error.message)
    stopAll(1)
  })
  child.once('close', (code, signal) => {
    children.delete(child)
    if (!stopping) {
      const reason = signal
        ? `сигнал ${signal}`
        : `код ${code ?? 'неизвестен'}`
      console.error(`${service.name} завершился (${reason}). Останавливаю остальные процессы.`)
      stopAll(code || 1)
    }
    if (stopping && children.size === 0) process.exit(exitCode)
  })
}

console.log('Vite выведет точный адрес frontend; API настроен на http://localhost:3000.')
console.log('Нажмите Ctrl+C, чтобы остановить серверы.')
