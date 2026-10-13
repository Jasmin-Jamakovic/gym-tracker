-- Progressive overload: per-set reps and weights, an increment per exercise, and what each workout lifted.
-- Run once in the Supabase SQL editor on a database created from an older schema.sql.

alter table public.exercises drop constraint if exists exercises_reps_check;
alter table public.exercises
  add constraint exercises_reps_check check (reps ~ '^[0-9]{1,3}(-[0-9]{1,3})?(,[0-9]{1,3}(-[0-9]{1,3})?)*$'),
  add column if not exists weight    text not null default '' check (weight ~ '^([0-9]{1,4}(\.[0-9]{1,2})?(,[0-9]{1,4}(\.[0-9]{1,2})?)*)?$'),
  add column if not exists increment numeric(5,2) not null default 0 check (increment between 0 and 100),
  add constraint exercises_reps_count   check (cardinality(string_to_array(reps, ',')) in (1, sets)),
  add constraint exercises_weight_count check (weight = '' or cardinality(string_to_array(weight, ',')) in (1, sets));

alter table public.workout_sessions
  add column if not exists performed jsonb not null default '[]';

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
