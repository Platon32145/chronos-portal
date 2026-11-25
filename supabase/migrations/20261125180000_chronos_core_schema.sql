create extension if not exists pgcrypto;

create schema if not exists private;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  nickname text not null check (char_length(nickname) between 2 and 32),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.user_roles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null check (role in ('tech_admin')),
  created_at timestamptz not null default now()
);

create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(title) between 3 and 120),
  description text not null check (char_length(description) between 10 and 5000),
  author_nickname text not null check (char_length(author_nickname) between 2 and 32),
  priority text not null default 'Обычная' check (priority in ('Низкая','Обычная','Высокая','Критическая')),
  status text not null default 'Ожидание' check (status in ('Ожидание','В работе','Выполнено','Архив · отклонено')),
  assignee_nickname text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.task_messages (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  author_nickname text not null check (char_length(author_nickname) between 2 and 32),
  author_role text not null default 'Автор' check (author_role in ('Автор','Техадмин')),
  body text not null check (char_length(body) between 1 and 5000),
  created_at timestamptz not null default now()
);

create index if not exists tasks_created_at_idx on public.tasks (created_at desc);
create index if not exists tasks_status_idx on public.tasks (status);
create index if not exists task_messages_task_created_idx on public.task_messages (task_id, created_at);
create index if not exists task_messages_user_id_idx on public.task_messages (user_id);

alter table public.profiles enable row level security;
alter table public.user_roles enable row level security;
alter table public.tasks enable row level security;
alter table public.task_messages enable row level security;

grant select, insert, update on public.profiles to authenticated;
grant select on public.user_roles to authenticated;
grant select on public.tasks to anon, authenticated;
grant insert on public.tasks to anon, authenticated;
grant update on public.tasks to authenticated;
grant select on public.task_messages to anon, authenticated;
grant insert on public.task_messages to authenticated;

create policy "profiles_select_own" on public.profiles for select to authenticated
using ((select auth.uid()) = id);
create policy "profiles_insert_own" on public.profiles for insert to authenticated
with check ((select auth.uid()) = id);
create policy "profiles_update_own" on public.profiles for update to authenticated
using ((select auth.uid()) = id)
with check ((select auth.uid()) = id);

create policy "roles_select_own" on public.user_roles for select to authenticated
using ((select auth.uid()) = user_id);

create policy "tasks_public_read" on public.tasks for select to anon, authenticated
using (true);
create policy "tasks_public_submit" on public.tasks for insert to anon, authenticated
with check (status = 'Ожидание' and assignee_nickname is null and char_length(author_nickname) between 2 and 32);
create policy "tasks_admin_update" on public.tasks for update to authenticated
using (exists (select 1 from public.user_roles r where r.user_id = (select auth.uid()) and r.role = 'tech_admin'))
with check (exists (select 1 from public.user_roles r where r.user_id = (select auth.uid()) and r.role = 'tech_admin'));

create policy "messages_public_read" on public.task_messages for select to anon, authenticated
using (true);
create policy "messages_admin_insert" on public.task_messages for insert to authenticated
with check (
  user_id = (select auth.uid())
  and author_role = 'Техадмин'
  and exists (select 1 from public.user_roles r where r.user_id = (select auth.uid()) and r.role = 'tech_admin')
);

create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, nickname)
  values (
    new.id,
    coalesce(nullif(trim(new.raw_user_meta_data ->> 'nickname'), ''), split_part(new.email, '@', 1))
  )
  on conflict (id) do nothing;
  return new;
end;
$$;
revoke all on function private.handle_new_user() from public, anon, authenticated;

drop trigger if exists on_auth_user_created_profile on auth.users;
create trigger on_auth_user_created_profile
after insert on auth.users
for each row execute function private.handle_new_user();

do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'tasks') then
    alter publication supabase_realtime add table public.tasks;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'task_messages') then
    alter publication supabase_realtime add table public.task_messages;
  end if;
end $$;
