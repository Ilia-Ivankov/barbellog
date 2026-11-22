import { useCallback, useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react'
import logo from './assets/logo.png'
import benchPressPhoto from './assets/Жим штанги в мрачном спортзале.png'
import archerPhoto from './assets/Упражнение лучник.png'
import diaryPreview from './assets/demo/Страница тренировок.png'
import statsPreview from './assets/demo/Статистика по упражнению.png'
import { api, clearSession, getSession, query, saveSession, type Equipment, type Exercise, type ExerciseStats, type MuscleGroup, type MuscleStats, type Session, type User, type Workout, type WorkoutExercise } from './api'
import './App.css'
/* eslint react-hooks/set-state-in-effect: off -- Page effects synchronize API loading and errors with route and filter state. */

type Route = { path: string; go: (path: string) => void }
const localDate = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
const today = () => localDate(new Date())
const dateDaysAgo = (days: number) => { const date = new Date(); date.setDate(date.getDate() - days); return localDate(date) }
const diaryFrom30Days = dateDaysAgo(30)
const diaryFrom90Days = dateDaysAgo(90)
const prettyDate = (date: string) => new Date(`${date}T12:00:00`).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', year: 'numeric' })
const formatNumber = (value: number, digits = 0) => new Intl.NumberFormat('ru-RU', { maximumFractionDigits: digits }).format(value)
const errorText = (error: unknown) => error instanceof Error ? error.message : 'Произошла ошибка. Попробуйте ещё раз.'

function useRoute(): Route {
  const [path, setPath] = useState(window.location.pathname)
  useEffect(() => { const change = () => setPath(window.location.pathname); window.addEventListener('popstate', change); return () => window.removeEventListener('popstate', change) }, [])
  const go = useCallback((next: string) => { window.history.pushState({}, '', next); setPath(next); window.scrollTo(0, 0) }, [])
  return { path, go }
}

function Icon({ name, size = 22 }: { name: string; size?: number }) {
  const common = { width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, 'aria-hidden': true as const }
  const shapes: Record<string, ReactNode> = {
    calendar: <><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 10h18M8 14h.01M12 14h.01M16 14h.01M8 17h.01M12 17h.01"/></>,
    dumbbell: <><path d="m6.5 6.5 11 11M4 9l5-5M15 20l5-5M3 7l4-4 2 2-4 4zM15 19l4-4 2 2-4 4zM2 12l4-4M18 16l4-4"/></>,
    chart: <><path d="M3 3v18h18M7 14l4-4 3 3 6-7"/><path d="M16 6h4v4"/></>,
    user: <><circle cx="12" cy="8" r="4"/><path d="M4 21v-2a8 8 0 0 1 16 0v2"/></>,
    plus: <path d="M12 5v14M5 12h14"/>,
    arrow: <path d="m9 18 6-6-6-6"/>,
    pulse: <path d="M3 12h4l3-8 4 16 3-8h4"/>,
    square: <rect x="4" y="4" width="16" height="16" rx="1"/>,
    weight: <><path d="M6 7h12l3 14H3L6 7Z"/><path d="M9 7a3 3 0 0 1 6 0"/></>,
    search: <><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/></>,
    close: <path d="m6 6 12 12M18 6 6 18"/>,
    trash: <><path d="M3 6h18M8 6V4h8v2m3 0-1 15H6L5 6m4 4v7m6-7v7"/></>,
    edit: <><path d="m15 5 4 4M4 20l4-.8L19 8a2.1 2.1 0 0 0-3-3L5 16l-1 4Z"/></>,
    logout: <><path d="M10 17l5-5-5-5M15 12H3"/><path d="M12 3h7a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-7"/></>,
    clock: <><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></>,
    reps: <><path d="M5 4h14M5 9h14M5 14h9M5 19h9"/></>,
  }
  return <svg {...common}>{shapes[name] || shapes.pulse}</svg>
}

function App() {
  const route = useRoute()
  const [session, setSession] = useState<Session | null>(() => getSession())
  const [checking, setChecking] = useState(Boolean(getSession()))
  const [mobileNav, setMobileNav] = useState(false)
  useEffect(() => {
    if (!session) { setChecking(false); return }
    api<User>('/auth/me').then(user => { const next = { ...session, user }; saveSession(next); setSession(next) }).catch(() => { clearSession(); setSession(null) }).finally(() => setChecking(false))
  // Validate the saved seven-day token once when the app starts.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  const login = (next: Session) => { saveSession(next); setSession(next); route.go('/app') }
  const logout = () => { clearSession(); setSession(null); route.go('/') }
  if (checking) return <div className="boot-screen"><img src={logo} alt=""/><span>Открываем дневник</span></div>
  if (route.path === '/login' || route.path === '/register') return <AuthPage mode={route.path === '/register' ? 'register' : 'login'} go={route.go} onLogin={login}/>
  if (route.path.startsWith('/app')) {
    if (!session) { route.go('/login'); return null }
    return <AppShell path={route.path} go={route.go} user={session.user} onLogout={logout} mobileNav={mobileNav} setMobileNav={setMobileNav}/>
  }
  return <Landing go={route.go} session={session}/>
}

function Landing({ go, session }: { go: (path: string) => void; session: Session | null }) {
  const startPath = session ? '/app' : '/register'
  return <main className="landing">
    <header className="landing-nav">
      <a className="brand" href="/" onClick={e => { e.preventDefault(); go('/') }}><img src={logo} alt="Barbellog"/><b>BARBELLOG</b></a>
      <nav className="landing-links" aria-label="Навигация по странице"><a href="#exercises">Упражнения</a><a href="#preview">Возможности</a></nav>
      <div className="landing-actions"><a href={session ? '/app' : '/login'} onClick={e => { e.preventDefault(); go(session ? '/app' : '/login') }}>{session ? 'Мой дневник' : 'Войти'}</a><button className="button" onClick={() => go(startPath)}>{session ? 'Открыть дневник' : 'Начать'} <Icon name="arrow" size={17}/></button></div>
    </header>

    <section className="landing-hero" aria-labelledby="landing-title">
      <div className="landing-hero-copy">
        <div className="landing-kicker"><i/> ДНЕВНИК СИЛОВЫХ ТРЕНИРОВОК</div>
        <h1 id="landing-title">Тренируйся.<br/>Записывай.<br/><em>Расти.</em></h1>
        <p>Каждый подход — часть пути. Сохраняйте тренировки и замечайте, как меняется ваша сила.</p>
        <button className="button" onClick={() => go(startPath)}>Начать вести дневник <Icon name="arrow" size={18}/></button>
        <span className="landing-hero-note"><span>01</span> СИЛА В ДЕТАЛЯХ</span>
      </div>
      <figure className="landing-hero-image">
        <img src={benchPressPhoto} alt="Атлет выполняет жим штанги лёжа в спортзале" fetchPriority="high"/>
        <figcaption><span>БАЗОВОЕ ДВИЖЕНИЕ</span><b>Жим штанги</b></figcaption>
      </figure>
    </section>

    <div className="landing-strip" aria-label="Возможности Barbellog"><span>01 — ТРЕНИРОВКИ</span><span>02 — УПРАЖНЕНИЯ</span><span>03 — ПРОГРЕСС</span></div>

    <section className="landing-section landing-exercises" id="exercises" aria-labelledby="exercise-title">
      <div className="landing-section-heading">
        <div><div className="landing-kicker"><i/> БИБЛИОТЕКА ДВИЖЕНИЙ</div><h2 id="exercise-title">Большая коллекция<br/>встроенных упражнений.</h2></div>
        <p>Выбирайте движение из каталога, добавляйте его в тренировку и возвращайтесь к результатам.</p>
      </div>
      <div className="landing-exercise-grid">
        <article className="landing-exercise-card">
          <div className="landing-exercise-copy"><span>01 / СО ШТАНГОЙ</span><h3>Жим штанги</h3><p>Отмечайте вес, повторы и объём каждой тренировки.</p></div>
          <img src={benchPressPhoto} alt="Жим штанги лёжа" loading="lazy"/>
        </article>
        <article className="landing-exercise-card">
          <div className="landing-exercise-copy"><span>02 / С СОБСТВЕННЫМ ВЕСОМ</span><h3>Упражнение лучник</h3><p>Сохраняйте рабочие подходы и следите за своей историей.</p></div>
          <img src={archerPhoto} alt="Отжимание лучника" loading="lazy"/>
        </article>
      </div>
    </section>

    <section className="landing-section landing-preview" id="preview" aria-labelledby="preview-title">
      <div className="landing-section-heading">
        <div><div className="landing-kicker"><i/> ВАШ ПРОГРЕСС — ПЕРЕД ГЛАЗАМИ</div><h2 id="preview-title">Записи превращаются<br/>в результат.</h2></div>
        <p>История тренировок и статистика помогают видеть проделанную работу в цифрах.</p>
      </div>
      <div className="landing-preview-grid">
        <figure className="landing-preview-card landing-preview-diary"><figcaption><span>01 / ИСТОРИЯ</span><b>Дневник тренировок</b></figcaption><img src={diaryPreview} alt="Экран дневника с записями тренировок" loading="lazy"/></figure>
        <figure className="landing-preview-card landing-preview-stats"><figcaption><span>02 / АНАЛИТИКА</span><b>Статистика упражнения</b></figcaption><img src={statsPreview} alt="Экран статистики: максимальный вес, объём и повторы" loading="lazy"/></figure>
      </div>
    </section>

    <section className="landing-cta" aria-labelledby="landing-cta-title">
      <div><div className="landing-kicker"><i/> СЛЕДУЮЩАЯ ТРЕНИРОВКА — ВАША</div><h2 id="landing-cta-title">Запишите первый подход.</h2><p>Ведите историю своей работы. Шаг за шагом.</p></div>
      <button className="button" onClick={() => go(startPath)}>{session ? 'Перейти в дневник' : 'Создать дневник'} <Icon name="arrow" size={18}/></button>
    </section>

    <footer className="landing-footer"><a className="brand" href="/" onClick={e => { e.preventDefault(); go('/') }}><img src={logo} alt=""/><b>BARBELLOG</b></a><span>Личный дневник силовых тренировок</span><a href="/login" onClick={e => { e.preventDefault(); go(session ? '/app' : '/login') }}>{session ? 'Мой дневник' : 'Войти'}</a></footer>
  </main>
}

function AuthPage({ mode, go, onLogin }: { mode: 'login' | 'register'; go: (path: string) => void; onLogin: (session: Session) => void }) {
  const [busy, setBusy] = useState(false); const [error, setError] = useState('')
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError('')
    const form = new FormData(event.currentTarget)
    const body = { email: String(form.get('email') || ''), password: String(form.get('password') || ''), ...(mode === 'register' ? { displayName: String(form.get('displayName') || '') } : {}) }
    try { onLogin(await api<Session>(`/auth/${mode}`, { method: 'POST', body: JSON.stringify(body) })) } catch (err) { setError(errorText(err)) } finally { setBusy(false) }
  }
  return <main className="auth-layout"><button className="auth-back" onClick={() => go('/')}>← На главную</button><div className="auth-card"><a className="brand" href="/" onClick={e => { e.preventDefault(); go('/') }}><img src={logo} alt=""/><b>BARBELLOG</b></a><div className="section-kicker">ВАШ ЛИЧНЫЙ ДНЕВНИК</div><h1>{mode === 'login' ? 'С возвращением.' : 'Начнём запись.'}</h1><p className="muted">{mode === 'login' ? 'Войдите, чтобы продолжить свой путь.' : 'Создайте аккаунт, чтобы сохранять тренировки.'}</p>
      <form onSubmit={submit} className="stack-form">{mode === 'register' && <label>Имя<input name="displayName" autoComplete="name" maxLength={120} required placeholder="Как к вам обращаться"/></label>}<label>Email<input name="email" type="email" autoComplete="email" required placeholder="you@example.com"/></label><label>Пароль<input name="password" type="password" autoComplete={mode === 'login' ? 'current-password' : 'new-password'} minLength={mode === 'register' ? 8 : undefined} required placeholder={mode === 'register' ? 'Не менее 8 символов' : 'Ваш пароль'}/></label>{error && <div className="notice error">{error}</div>}<button className="button full" disabled={busy}>{busy ? 'Подождите…' : mode === 'login' ? 'Войти в дневник' : 'Создать аккаунт'} <Icon name="arrow" size={17}/></button></form>
      <p className="auth-switch">{mode === 'login' ? 'Ещё нет аккаунта?' : 'Уже есть аккаунт?'} <button onClick={() => go(mode === 'login' ? '/register' : '/login')}>{mode === 'login' ? 'Зарегистрироваться' : 'Войти'}</button></p>
    </div><div className="auth-side"><div className="section-kicker">ЗАПОМНИ СВОЮ РАБОТУ</div><p>Каждый подход<br/>имеет значение.</p><span>СИЛА — ЭТО ИСТОРИЯ, КОТОРУЮ ВЫ ЗАПИСАЛИ.</span></div></main>
}

const navItems = [{ key: 'diary', label: 'Дневник', icon: 'calendar', path: '/app' }, { key: 'exercises', label: 'Упражнения', icon: 'dumbbell', path: '/app/exercises' }, { key: 'stats', label: 'Статистика', icon: 'chart', path: '/app/stats' }, { key: 'profile', label: 'Профиль', icon: 'user', path: '/app/profile' }]
function AppShell({ path, go, user, onLogout, mobileNav, setMobileNav }: { path: string; go: (path: string) => void; user: User; onLogout: () => void; mobileNav: boolean; setMobileNav: (value: boolean) => void }) {
  const heading = path.includes('/workouts/new') ? 'Новая тренировка' : path.match(/\/workouts\/[^/]+/) ? 'Тренировка' : path.includes('/exercises/') ? 'Статистика упражнения' : navItems.find(item => item.path === path)?.label || 'Дневник тренировок'
  const active = path.includes('/exercises') ? 'exercises' : navItems.find(item => item.path === path)?.key || 'diary'
  const [toast, setToast] = useState('')
  const notify = (message: string) => { setToast(message); window.setTimeout(() => setToast(''), 3000) }
  let content: ReactNode
  if (path.includes('/workouts/new')) content = <WorkoutEditor id={null} go={go} notify={notify}/>
  else if (path.match(/\/workouts\/[^/]+/)) content = <WorkoutEditor id={path.split('/').at(-1) || null} go={go} notify={notify}/>
  else if (path.includes('/exercises/')) content = <ExerciseDetail id={path.split('/').at(-1) || ''} go={go}/>
  else if (path === '/app/exercises') content = <ExercisesPage go={go} notify={notify}/>
  else if (path === '/app/stats') content = <StatsPage go={go}/>
  else if (path === '/app/profile') content = <ProfilePage user={user} onLogout={onLogout}/>
  else content = <DiaryPage go={go}/>
  return <div className="app-layout">
    <aside className={`sidebar ${mobileNav ? 'open' : ''}`}><a className="brand" href="/app" onClick={e => { e.preventDefault(); go('/app'); setMobileNav(false) }}><img src={logo} alt=""/><b>BARBELLOG</b></a><button className="sidebar-create" onClick={() => { go('/app/workouts/new'); setMobileNav(false) }}><Icon name="plus" size={20}/>Начать тренировку</button><nav className="side-nav">{navItems.map(item => <button key={item.key} className={active === item.key ? 'active' : ''} onClick={() => { go(item.path); setMobileNav(false) }}><Icon name={item.icon}/>{item.label}</button>)}</nav><div className="sidebar-bottom"><span className="avatar">{user.displayName.trim().slice(0, 1).toUpperCase()}</span><div className="sidebar-user"><b>{user.displayName}</b><small>Личный дневник</small></div><button className="icon-button logout" title="Выйти" onClick={onLogout}><Icon name="logout" size={19}/></button></div></aside>
    {mobileNav && <button className="nav-scrim" onClick={() => setMobileNav(false)} aria-label="Закрыть меню"/>}
    <main className="workspace"><header className="page-header"><button className="mobile-menu" onClick={() => setMobileNav(!mobileNav)} aria-label="Открыть меню"><span/><span/><span/></button><div><h1>{heading}</h1><p>{path === '/app' ? 'История вашей упорной работы.' : path.includes('/exercises') ? 'Сильнее с каждым повторением.' : path.includes('/stats') ? 'Ваш прогресс в цифрах.' : 'Тренировки без лишнего шума.'}</p></div>{path === '/app' && <button className="button header-cta" onClick={() => go('/app/workouts/new')}>Записать тренировку <Icon name="plus" size={18}/></button>}</header><div className="page-content">{content}</div></main>{toast && <div className="toast">{toast}</div>}
  </div>
}

function Loading({ label = 'Загружаем данные…' }: { label?: string }) { return <div className="loading"><span className="spinner"/>{label}</div> }
function Empty({ title, text, action }: { title: string; text: string; action?: ReactNode }) { return <div className="empty-state"><div className="empty-mark"><Icon name="pulse" size={26}/></div><h3>{title}</h3><p>{text}</p>{action}</div> }

function DiaryPage({ go }: { go: (path: string) => void }) {
  const [workouts, setWorkouts] = useState<Workout[]>([]); const [loading, setLoading] = useState(true); const [error, setError] = useState(''); const [period, setPeriod] = useState('all')
  useEffect(() => { let active = true; setLoading(true); setError(''); api<Workout[]>(`/workouts${query(period === 'all' ? {} : { from: period })}`).then(data => { if (active) setWorkouts(data) }).catch(err => { if (active) setError(errorText(err)) }).finally(() => { if (active) setLoading(false) }); return () => { active = false } }, [period])
  const filtered = workouts
  return <section className="content-column"><div className="section-heading"><div><div className="section-kicker">ВАША ИСТОРИЯ</div><h2>Тренировки</h2></div><select className="select-control" value={period} onChange={e => setPeriod(e.target.value)}><option value="all">За всё время</option><option value={diaryFrom30Days}>Последние 30 дней</option><option value={diaryFrom90Days}>Последние 3 месяца</option></select></div>
    {loading ? <Loading/> : error ? <div className="notice error">{error}</div> : filtered.length === 0 ? <Empty title="Первая запись начинается здесь" text="Запишите тренировку — подходы и прогресс останутся в вашем дневнике." action={<button className="button" onClick={() => go('/app/workouts/new')}>Записать тренировку <Icon name="plus" size={18}/></button>}/> : <div className="workout-list">{filtered.map(workout => <WorkoutCard key={workout.id} workout={workout} onClick={() => go(`/app/workouts/${workout.id}`)}/>)}</div>}
  </section>
}
function WorkoutCard({ workout, onClick }: { workout: Workout; onClick: () => void }) {
  const sets = workout.exercises.reduce((sum, item) => sum + item.sets.length, 0)
  const volume = workout.exercises.reduce((sum, item) => sum + item.sets.reduce((part, set) => part + set.reps * set.weightKg, 0), 0)
  return <button className="workout-card" onClick={onClick}><div className="workout-card-main"><div className="workout-title-line"><h3>{workout.name}</h3><time>{prettyDate(workout.performedOn)}</time></div>{workout.notes && <p className="workout-note">{workout.notes}</p>}<div className="workout-meta"><span><Icon name="pulse" size={18}/>{workout.exercises.length} {workout.exercises.length === 1 ? 'упражнение' : 'упражнения'}</span><span><Icon name="square" size={17}/>{sets} {sets === 1 ? 'подход' : sets > 1 && sets < 5 ? 'подхода' : 'подходов'}</span><span><Icon name="weight" size={18}/>{formatNumber(volume, 1)} кг объём</span></div></div><Icon name="arrow" size={21}/></button>
}

function WorkoutEditor({ id, go, notify }: { id: string | null; go: (path: string) => void; notify: (message: string) => void }) {
  const [name, setName] = useState('Тренировка'); const [date, setDate] = useState(today()); const [notes, setNotes] = useState(''); const [items, setItems] = useState<WorkoutExercise[]>([])
  const [catalog, setCatalog] = useState<Exercise[]>([]); const [loading, setLoading] = useState(Boolean(id)); const [busy, setBusy] = useState(false); const [error, setError] = useState(''); const [picker, setPicker] = useState(false); const [search, setSearch] = useState('')
  useEffect(() => {
    api<Exercise[]>('/exercises').then(setCatalog).catch(err => setError(errorText(err)))
    if (id) api<Workout>(`/workouts/${id}`).then(workout => { setName(workout.name); setDate(workout.performedOn); setNotes(workout.notes); setItems(workout.exercises) }).catch(err => setError(errorText(err))).finally(() => setLoading(false))
  }, [id])
  const results = useMemo(() => catalog.filter(item => item.name.toLocaleLowerCase('ru').includes(search.toLocaleLowerCase('ru')) && !items.some(selected => selected.exerciseId === item.id)).slice(0, 7), [catalog, search, items])
  const addExercise = (exercise: Exercise) => { setItems(current => [...current, { exerciseId: exercise.id, name: exercise.name, muscleGroupSlug: exercise.muscleGroup.slug, isBodyweight: exercise.isBodyweight, sets: [{ reps: 8, weightKg: 0 }] }]); setPicker(false); setSearch('') }
  const changeSet = (exerciseIndex: number, setIndex: number, key: 'reps' | 'weightKg', value: number) => setItems(current => current.map((item, i) => i !== exerciseIndex ? item : { ...item, sets: item.sets.map((set, j) => j !== setIndex ? set : { ...set, [key]: value }) }))
  const save = async (event: FormEvent) => { event.preventDefault(); setBusy(true); setError(''); try { const body = { performedOn: date, name, notes, exercises: items.map(item => ({ exerciseId: item.exerciseId, sets: item.sets.map(set => ({ reps: Number(set.reps), weightKg: item.isBodyweight ? 0 : Number(set.weightKg) })) })) }; const result = await api<Workout>(id ? `/workouts/${id}` : '/workouts', { method: id ? 'PUT' : 'POST', body: JSON.stringify(body) }); notify(id ? 'Тренировка обновлена' : 'Тренировка записана'); go(`/app/workouts/${result.id}`) } catch (err) { setError(errorText(err)) } finally { setBusy(false) } }
  const remove = async () => { if (!id || !window.confirm('Удалить эту тренировку?')) return; setBusy(true); try { await api(`/workouts/${id}`, { method: 'DELETE' }); notify('Тренировка удалена'); go('/app') } catch (err) { setError(errorText(err)) } finally { setBusy(false) } }
  if (loading) return <Loading/>
  return <form className="editor content-column" onSubmit={save}><div className="editor-toolbar"><button type="button" className="text-button" onClick={() => go('/app')}>← К дневнику</button>{id && <button type="button" className="danger-link" onClick={remove}><Icon name="trash" size={17}/> Удалить</button>}</div><div className="editor-card"><div className="form-grid"><label>Название<input required maxLength={160} value={name} onChange={e => setName(e.target.value)} placeholder="Например, Верх тела"/></label><label>Дата тренировки<input required type="date" value={date} onChange={e => setDate(e.target.value)}/></label></div><label className="field-block">Заметки<textarea maxLength={10000} rows={3} value={notes} onChange={e => setNotes(e.target.value)} placeholder="Самочувствие, цели или что хочется запомнить"/></label></div>
    <div className="exercise-list-heading"><div><div className="section-kicker">СОДЕРЖАНИЕ</div><h2>Упражнения <span>{items.length.toString().padStart(2, '0')}</span></h2></div><button type="button" className="outline-button" onClick={() => setPicker(!picker)}><Icon name="plus" size={18}/> Добавить упражнение</button></div>
    {picker && <div className="picker-panel"><div className="search-wrap"><Icon name="search" size={18}/><input autoFocus placeholder="Найти упражнение" value={search} onChange={e => setSearch(e.target.value)}/><button type="button" className="icon-button" onClick={() => setPicker(false)}><Icon name="close" size={18}/></button></div><div className="picker-results">{results.map(item => <button type="button" key={item.id} onClick={() => addExercise(item)}><span><b>{item.name}</b><small>{item.muscleGroup.name}{item.isBodyweight ? ' · Собственный вес' : ''}</small></span><Icon name="plus" size={18}/></button>)}{results.length === 0 && <p className="muted picker-empty">Ничего не найдено. Добавьте упражнение в каталоге.</p>}</div></div>}
    {items.map((exercise, i) => <article className="exercise-editor-card" key={`${exercise.exerciseId}-${i}`}><div className="exercise-editor-head"><div><span className="exercise-index">{String(i + 1).padStart(2, '0')}</span><div><h3>{exercise.name}</h3><small>{catalog.find(item => item.id === exercise.exerciseId)?.muscleGroup.name || 'Упражнение'}{exercise.isBodyweight ? ' · Собственный вес' : ''}</small></div></div><button type="button" className="icon-button" title="Убрать упражнение" onClick={() => setItems(items.filter((_, index) => index !== i))}><Icon name="trash" size={18}/></button></div><div className="sets-header"><span>ПОДХОД</span><span>ПОВТОРЫ</span><span>{exercise.isBodyweight ? 'ВЕС' : 'ВЕС, КГ'}</span><span/></div>{exercise.sets.map((set, j) => <div className="set-row" key={j}><b>{String(j + 1).padStart(2, '0')}</b><input aria-label="Повторы" type="number" min="1" max="32767" step="1" value={set.reps} onChange={e => changeSet(i, j, 'reps', Number(e.target.value))} required/><input aria-label="Вес в килограммах" type="number" min="0" step="0.01" value={exercise.isBodyweight ? '0' : set.weightKg} disabled={exercise.isBodyweight} onChange={e => changeSet(i, j, 'weightKg', Number(e.target.value))} required/><button type="button" className="icon-button set-delete" title="Удалить подход" onClick={() => setItems(items.map((item, index) => index !== i ? item : { ...item, sets: item.sets.length > 1 ? item.sets.filter((_, setIndex) => setIndex !== j) : item.sets }))}><Icon name="close" size={17}/></button></div>)}<button type="button" className="add-set" onClick={() => setItems(items.map((item, index) => index !== i ? item : { ...item, sets: [...item.sets, { reps: 8, weightKg: item.sets.at(-1)?.weightKg || 0 }] }))}><Icon name="plus" size={16}/> Добавить подход</button></article>)}
    {items.length === 0 && <Empty title="Добавьте первое упражнение" text="Выберите упражнение из каталога и внесите повторы и вес по подходам."/>}{error && <div className="notice error">{error}</div>}<div className="form-footer"><button type="button" className="text-button" onClick={() => go('/app')}>Отмена</button><button className="button" disabled={busy || items.length === 0}>{busy ? 'Сохраняем…' : id ? 'Сохранить изменения' : 'Записать тренировку'} <Icon name="arrow" size={17}/></button></div>
  </form>
}

function ExercisesPage({ go, notify }: { go: (path: string) => void; notify: (message: string) => void }) {
  const [items, setItems] = useState<Exercise[]>([]); const [groups, setGroups] = useState<MuscleGroup[]>([]); const [equipment, setEquipment] = useState<Equipment[]>([]); const [loading, setLoading] = useState(true); const [error, setError] = useState(''); const [search, setSearch] = useState(''); const [group, setGroup] = useState(''); const [dialog, setDialog] = useState<Exercise | 'new' | null>(null)
  const refresh = useCallback(async () => { setLoading(true); try { setItems(await api<Exercise[]>(`/exercises${query({ muscleGroup: group || undefined, search: search || undefined })}`)); setError('') } catch (err) { setError(errorText(err)) } finally { setLoading(false) } }, [group, search])
  useEffect(() => { refresh() }, [refresh]); useEffect(() => { api<MuscleGroup[]>('/catalog/muscle-groups').then(setGroups); api<Equipment[]>('/catalog/equipment').then(setEquipment) }, [])
  const archive = async (item: Exercise) => { if (!window.confirm(`Убрать «${item.name}» из каталога?`)) return; try { await api(`/exercises/${item.id}`, { method: 'DELETE' }); notify('Упражнение архивировано'); await refresh() } catch (err) { setError(errorText(err)) } }
  return <section className="content-column"><div className="section-heading"><div><div className="section-kicker">ВАША БИБЛИОТЕКА</div><h2>Упражнения</h2></div><button className="button" onClick={() => setDialog('new')}><Icon name="plus" size={18}/> Своё упражнение</button></div><div className="catalog-tools"><label className="search-wrap"><Icon name="search" size={18}/><input placeholder="Поиск упражнения" value={search} onChange={e => setSearch(e.target.value)}/></label><select className="select-control" value={group} onChange={e => setGroup(e.target.value)}><option value="">Все группы мышц</option>{groups.map(item => <option key={item.slug} value={item.slug}>{item.name}</option>)}</select></div>{loading ? <Loading/> : error ? <div className="notice error">{error}</div> : items.length === 0 ? <Empty title="Упражнений пока нет" text="Создайте упражнение или поменяйте фильтры поиска." action={<button className="button" onClick={() => setDialog('new')}>Добавить упражнение</button>}/> : <div className="exercise-grid">{items.map(item => <article className="exercise-card" key={item.id}><button className="exercise-card-main" onClick={() => go(`/app/exercises/${item.id}`)}><span className="exercise-icon"><Icon name="dumbbell" size={22}/></span><span className="exercise-card-title"><b>{item.name}</b><small>{item.muscleGroup.name}{item.isCustom && <i>МОЁ</i>}</small></span><Icon name="arrow" size={18}/></button><div className="exercise-card-footer"><span>{item.equipment.map(e => e.name).join(', ') || 'Без оборудования'}</span>{item.isCustom && <div><button className="icon-button" title="Изменить" onClick={() => setDialog(item)}><Icon name="edit" size={16}/></button><button className="icon-button" title="Архивировать" onClick={() => archive(item)}><Icon name="trash" size={16}/></button></div>}</div></article>)}</div>}{dialog && <ExerciseDialog item={dialog === 'new' ? null : dialog} groups={groups} equipment={equipment} onClose={() => setDialog(null)} onSaved={async () => { setDialog(null); notify(dialog === 'new' ? 'Упражнение добавлено' : 'Изменения сохранены'); await refresh() }}/>}</section>
}

function ExerciseDialog({ item, groups, equipment, onClose, onSaved }: { item: Exercise | null; groups: MuscleGroup[]; equipment: Equipment[]; onClose: () => void; onSaved: () => void }) {
  const [busy, setBusy] = useState(false); const [error, setError] = useState(''); const [selectedEquipment, setSelectedEquipment] = useState(item?.equipment.map(e => e.slug) || [])
  async function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); setBusy(true); const form = new FormData(event.currentTarget); const body = { name: String(form.get('name') || ''), description: String(form.get('description') || ''), muscleGroupSlug: String(form.get('muscleGroupSlug') || ''), isBodyweight: form.get('isBodyweight') === 'on', equipmentSlugs: selectedEquipment }; try { await api(item ? `/exercises/${item.id}` : '/exercises', { method: item ? 'PATCH' : 'POST', body: JSON.stringify(body) }); onSaved() } catch (err) { setError(errorText(err)) } finally { setBusy(false) } }
  return <div className="modal-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}><form className="modal-card stack-form" onSubmit={submit}><div className="modal-title"><div><div className="section-kicker">КАТАЛОГ</div><h2>{item ? 'Изменить упражнение' : 'Новое упражнение'}</h2></div><button type="button" className="icon-button" onClick={onClose}><Icon name="close"/></button></div><label>Название<input required maxLength={160} name="name" defaultValue={item?.name}/></label><label>Группа мышц<select name="muscleGroupSlug" defaultValue={item?.muscleGroup.slug || groups[0]?.slug} required>{groups.map(g => <option key={g.slug} value={g.slug}>{g.name}</option>)}</select></label><label>Описание<textarea name="description" rows={3} maxLength={5000} defaultValue={item?.description}/></label><label className="check-label"><input type="checkbox" name="isBodyweight" defaultChecked={item?.isBodyweight}/> Упражнение с собственным весом</label><fieldset className="equipment-options"><legend>Оборудование</legend>{equipment.map(e => <label key={e.slug} className="check-label"><input type="checkbox" checked={selectedEquipment.includes(e.slug)} onChange={() => setSelectedEquipment(current => current.includes(e.slug) ? current.filter(x => x !== e.slug) : [...current, e.slug])}/>{e.name}</label>)}</fieldset>{error && <div className="notice error">{error}</div>}<div className="modal-actions"><button type="button" className="text-button" onClick={onClose}>Отмена</button><button className="button" disabled={busy}>{busy ? 'Сохраняем…' : 'Сохранить'} <Icon name="arrow" size={17}/></button></div></form></div>
}

function ExerciseDetail({ id, go }: { id: string; go: (path: string) => void }) {
  const [exercise, setExercise] = useState<Exercise | null>(null); const [stats, setStats] = useState<ExerciseStats | null>(null); const [range, setRange] = useState('12'); const [from, setFrom] = useState(() => dateDaysAgo(84)); const [to, setTo] = useState(today()); const [loading, setLoading] = useState(true); const [error, setError] = useState('')
  useEffect(() => { if (range === 'custom' && from > to) { setError('Начало периода не может быть позже окончания'); return } let active = true; setLoading(true); setError(''); const bounds = range === 'all' ? {} : range === 'custom' ? { from, to } : { from: dateDaysAgo(Number(range) * 7), to: today() }; Promise.all([api<Exercise>(`/exercises/${id}`), api<ExerciseStats>(`/exercises/${id}/stats${query(bounds)}`)]).then(([e, s]) => { if (active) { setExercise(e); setStats(s) } }).catch(err => { if (active) setError(errorText(err)) }).finally(() => { if (active) setLoading(false) }); return () => { active = false } }, [id, range, from, to])
  if (loading) return <Loading/>; if (error) return <div className="content-column"><button className="text-button" onClick={() => go('/app/exercises')}>← К упражнениям</button><div className="notice error">{error}</div></div>; if (!exercise || !stats) return null
  return <section className="content-column"><button className="text-button back-link" onClick={() => go('/app/exercises')}>← Все упражнения</button><div className="detail-heading"><span className="exercise-icon large"><Icon name="dumbbell" size={28}/></span><div><div className="section-kicker">{exercise.muscleGroup.name.toUpperCase()}</div><h2>{exercise.name}</h2><p>{exercise.description || exercise.equipment.map(e => e.name).join(' · ')}</p></div><select className="select-control" value={range} onChange={e => setRange(e.target.value)}><option value="4">4 недели</option><option value="12">12 недель</option><option value="52">12 месяцев</option><option value="all">Весь период</option><option value="custom">Выбрать даты</option></select></div>{range === 'custom' && <div className="date-range"><label>С<input type="date" value={from} onChange={e => setFrom(e.target.value)}/></label><label>По<input type="date" value={to} onChange={e => setTo(e.target.value)}/></label></div>}<div className="metric-grid"><Metric label="Максимальный вес" value={`${formatNumber(stats.maxWeightKg, 2)} кг`} icon="weight"/><Metric label="Объём за период" value={`${formatNumber(stats.weekly.reduce((n, item) => n + item.volumeKg, 0), 0)} кг`} icon="chart"/><Metric label="Повторы" value={formatNumber(stats.weekly.reduce((n, item) => n + item.reps, 0))} icon="reps"/></div><div className="charts-grid"><div className="chart-card"><div className="chart-title"><div><div className="section-kicker">ПРОГРЕСС</div><h3>Максимальный вес</h3></div><span>КГ</span></div>{stats.maxByDate.length ? <LineChart data={stats.maxByDate.map(item => ({ label: prettyDate(item.date).replace(' г.', ''), value: item.weightKg }))}/> : <ChartEmpty/>}</div><div className="chart-card"><div className="chart-title"><div><div className="section-kicker">НЕДЕЛЬНЫЙ РИТМ</div><h3>Объём тренировок</h3></div><span>КГ</span></div>{stats.weekly.length ? <BarChart data={stats.weekly.slice(-8).map(item => ({ label: prettyDate(item.weekStart).slice(0, 6), value: item.volumeKg }))}/> : <ChartEmpty/>}</div></div><div className="chart-card reps-card"><div className="chart-title"><div><div className="section-kicker">РАБОЧИЕ ПОВТОРЫ</div><h3>Повторы по неделям</h3></div><span>ПОВТОРЫ</span></div>{stats.weekly.length ? <BarChart data={stats.weekly.slice(-8).map(item => ({ label: prettyDate(item.weekStart).slice(0, 6), value: item.reps }))}/> : <ChartEmpty/>}</div></section>
}

function Metric({ label, value, icon }: { label: string; value: string; icon: string }) { return <div className="metric-card"><span><Icon name={icon} size={19}/>{label}</span><b>{value}</b></div> }
function ChartEmpty() { return <div className="chart-empty">Здесь появятся данные после первых тренировок.</div> }
function LineChart({ data }: { data: { label: string; value: number }[] }) {
  const max = Math.max(...data.map(d => d.value), 1); const min = Math.min(...data.map(d => d.value), 0); const span = max - min || 1
  const chartPoints = data.map((d, i) => ({ x: data.length === 1 ? 50 : 8 + i * 84 / (data.length - 1), y: 92 - ((d.value - min) / span) * 76 }))
  const points = chartPoints.map(({ x, y }) => `${x},${y}`).join(' ')
  return <div className="line-chart"><div className="line-chart-plot"><svg viewBox="0 0 100 100" preserveAspectRatio="none" role="img" aria-label="График максимального веса"><path className="chart-gridline" d="M0 16H100M0 54H100M0 92H100"/><polyline points={points}/></svg>{chartPoints.map(({ x, y }, i) => <span key={i} className="line-chart-point" style={{ left: `${x}%`, top: `${y}%` }}/>)}</div><div className="chart-labels"><span>{data[0].label}</span><span>{data.at(-1)?.label}</span></div></div>
}
function BarChart({ data }: { data: { label: string; value: number }[] }) {
  const max = Math.max(...data.map(d => d.value), 1)
  return <div className="bar-chart">{data.map((item, i) => <div className="bar-item" key={`${item.label}-${i}`}><div className="bar-track"><span style={{ height: `${Math.max(4, item.value / max * 100)}%` }} title={formatNumber(item.value, 1)}/></div><small>{item.label}</small><b>{formatNumber(item.value, 0)}</b></div>)}</div>
}

function StatsPage({ go }: { go: (path: string) => void }) {
  const [stats, setStats] = useState<MuscleStats | null>(null); const [range, setRange] = useState('12'); const [from, setFrom] = useState(dateDaysAgo(84)); const [to, setTo] = useState(today()); const [loading, setLoading] = useState(true); const [error, setError] = useState('')
  useEffect(() => { if (range === 'custom' && from > to) { setError('Начало периода не может быть позже окончания'); return } let active = true; setLoading(true); setError(''); const bounds = range === 'all' ? {} : range === 'custom' ? { from, to } : { from: dateDaysAgo(Number(range) * 7), to: today() }; api<MuscleStats>(`/stats/muscle-groups${query(bounds)}`).then(data => { if (active) setStats(data) }).catch(err => { if (active) setError(errorText(err)) }).finally(() => { if (active) setLoading(false) }); return () => { active = false } }, [range, from, to])
  const weeks = useMemo(() => [...new Set(stats?.weeklyVolume.map(item => item.weekStart) || [])].slice(-8), [stats]); const totalReps = stats?.reps.reduce((sum, item) => sum + item.reps, 0) || 0; const totalVolume = stats?.weeklyVolume.reduce((sum, item) => sum + item.volumeKg, 0) || 0
  return <section className="content-column"><div className="section-heading"><div><div className="section-kicker">СИЛА В ЦИФРАХ</div><h2>Статистика</h2></div><select className="select-control" value={range} onChange={e => setRange(e.target.value)}><option value="4">4 недели</option><option value="12">12 недель</option><option value="52">12 месяцев</option><option value="all">Весь период</option><option value="custom">Выбрать даты</option></select></div>{range === 'custom' && <div className="date-range"><label>С<input type="date" value={from} onChange={e => setFrom(e.target.value)}/></label><label>По<input type="date" value={to} onChange={e => setTo(e.target.value)}/></label></div>}{loading ? <Loading/> : error ? <div className="notice error">{error}</div> : <><div className="metric-grid"><Metric label="Всего повторов" value={formatNumber(totalReps)} icon="reps"/><Metric label="Объём за период" value={`${formatNumber(totalVolume, 0)} кг`} icon="weight"/><Metric label="Групп мышц" value={formatNumber(stats?.reps.length || 0)} icon="pulse"/></div><div className="charts-grid"><div className="chart-card"><div className="chart-title"><div><div className="section-kicker">РАСПРЕДЕЛЕНИЕ</div><h3>Повторы по группам мышц</h3></div><span>ПОВТОРЫ</span></div>{stats?.reps.length ? <div className="group-bars">{stats.reps.map(item => <div className="group-bar" key={item.muscleGroupSlug}><span>{item.muscleGroup}</span><div><i style={{ width: `${Math.max(2, item.reps / Math.max(...stats.reps.map(x => x.reps)) * 100)}%` }}/></div><b>{formatNumber(item.reps)}</b></div>)}</div> : <ChartEmpty/>}</div><div className="chart-card"><div className="chart-title"><div><div className="section-kicker">НЕДЕЛЯ ЗА НЕДЕЛЕЙ</div><h3>Объём за неделю</h3></div><span>КГ</span></div>{weeks.length ? <div className="stack-chart">{weeks.map(week => { const rows = stats!.weeklyVolume.filter(row => row.weekStart === week); const total = rows.reduce((n, row) => n + row.volumeKg, 0); return <div className="stack-week" key={week}><div className="stack-value">{formatNumber(total, 0)}</div><div className="stack-bar" style={{ height: `${Math.max(5, total / Math.max(...weeks.map(w => stats!.weeklyVolume.filter(r => r.weekStart === w).reduce((n, r) => n + r.volumeKg, 0)), 1) * 100)}%` }}/><small>{prettyDate(week).slice(0, 6)}</small></div> })}</div> : <ChartEmpty/>}</div></div><div className="section-heading exercise-stats-heading"><div><div className="section-kicker">ВАША ТЕХНИКА И РЕЗУЛЬТАТЫ</div><h2>По упражнениям</h2></div><span className="muted">Выберите упражнение, чтобы увидеть динамику</span></div><button className="stats-link" onClick={() => go('/app/exercises')}>Перейти к упражнениям <Icon name="arrow" size={18}/></button></>}</section>
}

function ProfilePage({ user, onLogout }: { user: User; onLogout: () => void }) { return <section className="content-column profile-page"><div className="section-kicker">АККАУНТ</div><h2>Профиль</h2><div className="profile-card"><div className="profile-avatar">{user.displayName.trim().slice(0, 1).toUpperCase()}</div><div><h3>{user.displayName}</h3><p>{user.email}</p></div></div><div className="profile-card profile-session"><span className="session-icon"><Icon name="clock"/></span><div><h3>Ваш дневник защищён</h3><p>Сессия действует до 7 дней. При выходе на этом устройстве сохранённый вход завершится.</p></div><button className="outline-button" onClick={onLogout}><Icon name="logout" size={17}/> Выйти</button></div><div className="profile-note"><div className="section-kicker">О BARBELLOG</div><p>Тише. Точнее. Сильнее.</p><small>Личный дневник тренировок, подходов и прогресса.</small></div></section> }

export default App
