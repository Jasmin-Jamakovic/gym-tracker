-- Gym Tracker database. Run once in the Supabase SQL editor.

-- ---------- the plan ----------
create table public.workout_days (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  position   int  not null default 0,
  name       text not null check (char_length(name) between 1 and 60),
  focus      text not null default '' check (char_length(focus) <= 120),
  created_at timestamptz not null default now()
);

create table public.exercises (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  day_id     uuid not null references public.workout_days(id) on delete cascade,
  position   int  not null default 0,
  name       text not null check (char_length(name) between 1 and 80),
  sets       int  not null check (sets between 1 and 20),
  -- one value for every set ("8", "8-12") or one per set ("8,10,12,8")
  reps       text not null check (reps ~ '^[0-9]{1,3}(-[0-9]{1,3})?(,[0-9]{1,3}(-[0-9]{1,3})?)*$'),
  weight     text not null default '' check (weight ~ '^([0-9]{1,4}(\.[0-9]{1,2})?(,[0-9]{1,4}(\.[0-9]{1,2})?)*)?$'),  -- kg, same rule; '' = no weight
  increment  numeric(5,2) not null default 0 check (increment between 0 and 100),   -- kg added to every set after a finished workout
  rest       text not null default '' check (char_length(rest) <= 20),
  execution  text not null default '' check (char_length(execution) <= 300),
  created_at timestamptz not null default now(),
  check (cardinality(string_to_array(reps, ',')) in (1, sets)),
  check (weight = '' or cardinality(string_to_array(weight, ',')) in (1, sets))
);

create table public.diet_plan (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  position   int  not null default 0,
  meal       text not null default 'Meal',
  food       text not null check (char_length(food) between 1 and 120),
  calories   int  not null check (calories >= 0),
  protein    numeric(6,1) check (protein >= 0),
  carbs      numeric(6,1) check (carbs >= 0),
  fat        numeric(6,1) check (fat >= 0),
  created_at timestamptz not null default now()
);

create table public.regulars (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  position   int  not null default 0,
  name       text not null check (char_length(name) between 1 and 60),
  dose       numeric(8,2) check (dose >= 0),
  unit       text not null default '',
  timing     text not null default '',
  created_at timestamptz not null default now(),
  unique (user_id, name)
);

create table public.sleep_plan (
  user_id    uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  bed        time not null default '23:00',
  wake       time not null default '07:00'
);

-- ---------- what you did ----------
create table public.workout_sessions (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  day_id     uuid references public.workout_days(id) on delete set null,
  date       date not null,
  name       text not null,             -- kept when the plan day is deleted or re-imported
  performed  jsonb not null default '[]',  -- what was lifted and what the plan moved to: [{id, name, sets, reps, weight, next}]
  created_at timestamptz not null default now(),
  unique (user_id, day_id, date)        -- a double tap can't log the same workout twice
);

create table public.food_log (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  date       date not null,
  meal       text not null default 'Meal',
  food       text not null check (char_length(food) between 1 and 120),
  calories   int  not null check (calories >= 0),
  protein    numeric(6,1), carbs numeric(6,1), fat numeric(6,1),
  created_at timestamptz not null default now()
);

create table public.supplement_log (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  date       date not null,
  time       time,
  supplement text not null,
  dose       numeric(8,2),
  unit       text not null default '',
  notes      text not null default '',
  created_at timestamptz not null default now()
);

create table public.sleep_log (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  date       date not null,             -- the morning you woke up
  bed        time not null,
  wake       time not null,
  hours      numeric(4,2) not null,     -- calculated by the app, handles past midnight
  notes      text not null default '',
  created_at timestamptz not null default now(),
  unique (user_id, date)
);

create table public.fee_payments (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  date       date not null,             -- the day the monthly gym fee was paid
  created_at timestamptz not null default now(),
  unique (user_id, date)
);

-- ---------- indexes for the common queries ----------
create index on public.workout_days (user_id, position);
create index on public.exercises (day_id, position);
create index on public.workout_sessions (user_id, date);
create index on public.food_log (user_id, date);
create index on public.supplement_log (user_id, date);

-- ---------- row level security ----------
-- every table: you only see and change your own rows
do $$
declare t text;
begin
  foreach t in array array['workout_days','exercises','diet_plan','regulars','sleep_plan',
                           'workout_sessions','food_log','supplement_log','sleep_log','fee_payments'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format($p$create policy "own rows" on public.%I for all to authenticated
                     using (user_id = (select auth.uid()))
                     with check (user_id = (select auth.uid()))$p$, t);
  end loop;
end $$;

-- you can't attach an exercise or a session to someone else's day
create policy "own day" on public.exercises as restrictive for insert to authenticated
  with check (exists (select 1 from public.workout_days d where d.id = day_id and d.user_id = (select auth.uid())));
create policy "own day on update" on public.exercises as restrictive for update to authenticated
  using (true)
  with check (exists (select 1 from public.workout_days d where d.id = day_id and d.user_id = (select auth.uid())));
create policy "own day" on public.workout_sessions as restrictive for insert to authenticated
  with check (day_id is null or exists (select 1 from public.workout_days d where d.id = day_id and d.user_id = (select auth.uid())));

-- logged-out visitors (the anon role) have no policy, so they can read nothing

-- ---------- functions ----------
-- workout import: replace the whole workout plan in one transaction
create or replace function public.replace_workout_plan(days jsonb)
returns void language plpgsql security invoker set search_path = public as $$
declare d jsonb; e jsonb; new_day uuid; i int := 0; j int;
begin
  delete from workout_days where user_id = auth.uid();   -- exercises go with them
  for d in select value from jsonb_array_elements(days) loop
    insert into workout_days (position, name, focus)
    values (i, d->>'name', coalesce(d->>'focus', '')) returning id into new_day;
    j := 0;
    for e in select value from jsonb_array_elements(coalesce(d->'exercises', '[]')) loop
      insert into exercises (day_id, position, name, sets, reps, weight, increment, rest, execution)
      values (new_day, j, e->>'name', (e->>'sets')::int, e->>'reps', coalesce(e->>'weight', ''),
              coalesce(nullif(e->>'increment', '')::numeric, 0), coalesce(e->>'rest', ''), coalesce(e->>'execution', ''));
      j := j + 1;
    end loop;
    i := i + 1;
  end loop;
  -- re-importing the same plan keeps finished workouts attached to their cards
  update workout_sessions s set day_id = (
    select d.id from workout_days d where d.user_id = auth.uid() and d.name = s.name order by d.position limit 1)
  where s.user_id = auth.uid() and s.day_id is null;
end $$;

-- second import: a null argument means "not in the file, leave it alone"
create or replace function public.replace_other_plan(diet jsonb, regs jsonb, sleep jsonb)
returns void language plpgsql security invoker set search_path = public as $$
begin
  if diet is not null then
    delete from diet_plan where user_id = auth.uid();
    insert into diet_plan (position, meal, food, calories, protein, carbs, fat)
    select ord - 1, x->>'meal', x->>'food', (x->>'calories')::int,
           nullif(x->>'protein', '')::numeric, nullif(x->>'carbs', '')::numeric, nullif(x->>'fat', '')::numeric
    from jsonb_array_elements(diet) with ordinality as t(x, ord);
  end if;
  if regs is not null then
    delete from regulars where user_id = auth.uid();
    insert into regulars (position, name, dose, unit, timing)
    select ord - 1, x->>'name', nullif(x->>'dose', '')::numeric, coalesce(x->>'unit', ''), coalesce(x->>'timing', '')
    from jsonb_array_elements(regs) with ordinality as t(x, ord);
  end if;
  if sleep is not null then
    insert into sleep_plan (user_id, bed, wake) values (auth.uid(), (sleep->>'bed')::time, (sleep->>'wake')::time)
    on conflict (user_id) do update set bed = excluded.bed, wake = excluded.wake;
  end if;
end $$;

-- delete my account: removes the login, and every table cascades
create or replace function public.delete_my_account()
returns void language sql security definer set search_path = '' as $$
  delete from auth.users where id = auth.uid();
$$;

revoke execute on function public.replace_workout_plan(jsonb), public.replace_other_plan(jsonb, jsonb, jsonb),
                           public.delete_my_account() from public, anon;
grant  execute on function public.replace_workout_plan(jsonb), public.replace_other_plan(jsonb, jsonb, jsonb),
                           public.delete_my_account() to authenticated;
