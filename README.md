# Chronos — «Фембойские шалости на техах»

Рабочий портал обращений на React + Vite + Supabase. Задачи хранятся в Postgres, авторизация выполняется через Supabase Auth, обновления задач и переписки приходят через Realtime.

## Локальный запуск (PowerShell)

```powershell
Copy-Item .env.example .env.local
npm install
npm run dev
```

Откройте адрес, напечатанный Vite (обычно `http://localhost:5173`). Файл `.env.local` уже содержит публичные URL и publishable key проекта Chronos. Публичный ключ предназначен для браузера и защищён RLS; секретный/service-role ключ в клиент не добавлять.

## Production-сборка

```powershell
npm run build
npm run preview
```

## Возможности

- Публичная отправка обращения без регистрации: никнейм, заголовок, описание и приоритет.
- Регистрация и вход по email + паролю через Supabase Auth.
- Профиль с никнеймом, который задаётся при регистрации.
- Общий реестр задач и актуальные статусы.
- Техадмин может брать задачу, отклонять её, завершать, отвечать в переписке и копировать историю или печатать её в PDF.
- Обновления задач и сообщений в реальном времени.

**Важно о видимости:** в текущей схеме реестр задач и переписка доступны для чтения без входа в аккаунт; не публикуйте в обращениях пароли, персональные или конфиденциальные данные. Отправлять ответы и менять статусы могут только назначенные техадмины.

## Назначение техадмина

Роль нельзя выдать через интерфейс регистрации. Сначала пользователь должен создать аккаунт и подтвердить email (если подтверждение включено). Затем в Supabase SQL Editor выполните запрос, заменив email на нужный адрес:

```sql
insert into public.user_roles (user_id, role)
select id, 'tech_admin'
from auth.users
where lower(email) = lower('ADMIN_EMAIL_HERE')
on conflict (user_id) do update set role = excluded.role;
```

RLS не разрешает обычным пользователям читать чужие роли, назначать себе техадмина или менять чужие задачи.

## GitHub Pages

Workflow `.github/workflows/deploy.yml` собирает сайт при push в `main`. В настройках репозитория добавьте Actions Variables:

- `VITE_SUPABASE_URL` = `https://ikgzrngqmtnjuerngznm.supabase.co`
- `VITE_SUPABASE_PUBLISHABLE_KEY` = publishable key из `.env.example`

Добавьте адрес `https://platon32145.github.io/chronos-portal/` в Supabase Dashboard → Authentication → URL Configuration → Redirect URLs. Затем откройте **Settings → Pages** и выберите **GitHub Actions** в качестве источника публикации. Для репозитория `Platon32145/chronos-portal` адрес сайта будет `https://platon32145.github.io/chronos-portal/`.

## Бесплатный план

Проект Supabase создан с расчётной стоимостью $0/мес. Бесплатные проекты могут автоматически приостанавливаться после периода неактивности и имеют лимиты по базе, трафику и авторизации. Для постоянной работы без пауз может потребоваться платный тариф; контролируйте usage в Supabase Dashboard.

## Структура базы

- `profiles` — никнеймы пользователей.
- `user_roles` — назначенные вручную роли `tech_admin`.
- `tasks` — обращения и их состояние.
- `task_messages` — ответы техадмина.

Миграция находится в `supabase/migrations/20261125180000_chronos_core_schema.sql`.
