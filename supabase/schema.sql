create table if not exists public.qmq_rooms (
  id uuid primary key,
  room_code text not null unique check (room_code ~ '^[A-Z0-9]{6}$'),
  room_name text,
  released_question_ids text[] not null default '{}',
  status text not null default 'active' check (status in ('active', 'finished')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  finished_at timestamptz
);

create table if not exists public.qmq_room_admin (
  room_id uuid primary key references public.qmq_rooms(id) on delete cascade,
  admin_key_hash text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.qmq_ubs_teams (
  id uuid primary key,
  room_id uuid not null references public.qmq_rooms(id) on delete cascade,
  name text not null,
  name_normalized text not null,
  created_at timestamptz not null default now(),
  unique (room_id, name_normalized)
);

create table if not exists public.qmq_students (
  id uuid primary key,
  room_id uuid not null references public.qmq_rooms(id) on delete cascade,
  ubs_id uuid not null references public.qmq_ubs_teams(id) on delete restrict,
  nickname text not null,
  nickname_normalized text not null,
  avatar_id text not null default 'avatar-01',
  total_score numeric(7,1) not null default 0,
  answered_count integer not null default 0,
  joined_at timestamptz not null default now(),
  last_activity_at timestamptz not null default now(),
  unique (room_id, nickname_normalized)
);

alter table public.qmq_students
  add column if not exists avatar_id text not null default 'avatar-01';

alter table public.qmq_students
  alter column avatar_id set default 'avatar-01';

update public.qmq_students
  set avatar_id = 'avatar-01'
  where avatar_id is null or avatar_id = 'pulse';

create table if not exists public.qmq_answers (
  id uuid primary key,
  room_id uuid not null references public.qmq_rooms(id) on delete cascade,
  student_id uuid not null references public.qmq_students(id) on delete cascade,
  question_id text not null,
  selected_option_id text not null check (selected_option_id in ('A', 'B', 'C', 'D', 'TIMEOUT')),
  is_correct boolean not null,
  used_hint boolean not null default false,
  score numeric(5,1) not null default 0,
  answered_at timestamptz not null default now(),
  unique (student_id, question_id)
);

create table if not exists public.qmq_question_timers (
  room_id uuid not null references public.qmq_rooms(id) on delete cascade,
  student_id uuid not null references public.qmq_students(id) on delete cascade,
  question_id text not null,
  started_at timestamptz not null default now(),
  primary key (room_id, student_id, question_id)
);

create index if not exists qmq_ubs_room_idx on public.qmq_ubs_teams(room_id);
create index if not exists qmq_students_room_idx on public.qmq_students(room_id);
create index if not exists qmq_students_ubs_idx on public.qmq_students(ubs_id);
create index if not exists qmq_answers_room_idx on public.qmq_answers(room_id);
create index if not exists qmq_answers_student_idx on public.qmq_answers(student_id);
create index if not exists qmq_question_timers_student_idx on public.qmq_question_timers(student_id);

do $$
begin
  if exists (
    select 1
    from pg_constraint
    where conname = 'qmq_answers_selected_option_id_check'
  ) then
    alter table public.qmq_answers drop constraint qmq_answers_selected_option_id_check;
  end if;
end $$;

alter table public.qmq_answers
  add constraint qmq_answers_selected_option_id_check
  check (selected_option_id in ('A', 'B', 'C', 'D', 'TIMEOUT'));

alter table public.qmq_rooms replica identity full;
alter table public.qmq_ubs_teams replica identity full;
alter table public.qmq_students replica identity full;
alter table public.qmq_answers replica identity full;
alter table public.qmq_question_timers replica identity full;

do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'qmq_rooms') then
    alter publication supabase_realtime add table public.qmq_rooms;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'qmq_ubs_teams') then
    alter publication supabase_realtime add table public.qmq_ubs_teams;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'qmq_students') then
    alter publication supabase_realtime add table public.qmq_students;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'qmq_answers') then
    alter publication supabase_realtime add table public.qmq_answers;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'qmq_question_timers') then
    alter publication supabase_realtime add table public.qmq_question_timers;
  end if;
end $$;

alter table public.qmq_rooms enable row level security;
alter table public.qmq_room_admin enable row level security;
alter table public.qmq_ubs_teams enable row level security;
alter table public.qmq_students enable row level security;
alter table public.qmq_answers enable row level security;
alter table public.qmq_question_timers enable row level security;

revoke all on table public.qmq_room_admin from anon, authenticated;
revoke insert, update, delete on table public.qmq_rooms from anon, authenticated;
revoke insert, update, delete on table public.qmq_ubs_teams from anon, authenticated;
revoke insert, update, delete on table public.qmq_students from anon, authenticated;
revoke insert, update, delete on table public.qmq_answers from anon, authenticated;
revoke insert, update, delete on table public.qmq_question_timers from anon, authenticated;

grant select on table public.qmq_rooms to anon, authenticated;
grant select on table public.qmq_ubs_teams to anon, authenticated;
grant select on table public.qmq_students to anon, authenticated;
grant select on table public.qmq_answers to anon, authenticated;
grant select on table public.qmq_question_timers to anon, authenticated;

drop policy if exists "qmq public read rooms" on public.qmq_rooms;
drop policy if exists "qmq public read ubs" on public.qmq_ubs_teams;
drop policy if exists "qmq public read students" on public.qmq_students;
drop policy if exists "qmq public read answers" on public.qmq_answers;
drop policy if exists "qmq public read timers" on public.qmq_question_timers;

create policy "qmq public read rooms" on public.qmq_rooms for select using (true);
create policy "qmq public read ubs" on public.qmq_ubs_teams for select using (true);
create policy "qmq public read students" on public.qmq_students for select using (true);
create policy "qmq public read answers" on public.qmq_answers for select using (true);
create policy "qmq public read timers" on public.qmq_question_timers for select using (true);
