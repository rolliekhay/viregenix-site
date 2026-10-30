-- Run this once: Supabase dashboard > SQL Editor > New query > paste > Run.
-- BEFORE running, replace YOUR_ADMIN_EMAIL with the email you will log in with (appears twice).

create table if not exists public.intake_submissions (
  id          uuid primary key default gen_random_uuid(),
  created_at  timestamptz not null default now(),
  full_name   text,
  email       text,
  location    text,
  status      text not null default 'new'
              check (status in ('new','reviewing','in_analysis','completed')),
  paid        boolean not null default false,
  notes       text,
  data        jsonb not null
);

create index if not exists intake_submissions_created_idx
  on public.intake_submissions (created_at desc);

-- Lock the table. Nobody can read or write from a browser unless a policy allows it.
alter table public.intake_submissions enable row level security;

-- Only you (logged in with your admin email) can read and update.
create policy "admin can read"
  on public.intake_submissions for select to authenticated
  using ((auth.jwt() ->> 'email') = 'YOUR_ADMIN_EMAIL');

create policy "admin can update"
  on public.intake_submissions for update to authenticated
  using ((auth.jwt() ->> 'email') = 'YOUR_ADMIN_EMAIL')
  with check ((auth.jwt() ->> 'email') = 'YOUR_ADMIN_EMAIL');

-- There is deliberately NO insert policy. New submissions arrive only through
-- the /api/intake function, which uses the secret service key.
