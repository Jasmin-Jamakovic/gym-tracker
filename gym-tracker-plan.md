# Gym Tracker: Detailed Plan

A web app to track gym progress: workouts, calories, supplements and sleep. **Anyone can create an account and log in**, and every account has its own plan and its own data. It runs on **Fly.io** (hosting) and **Supabase** (accounts + database), and costs nothing or a couple of dollars a month.

The core idea: **you import your plan, and then you just check things off each day.** Your workout plan becomes cards you tap when a workout is done, your supplements become a checklist, and your sleep is one tap if you slept as planned.

A clickable mockup of all the app screens (without accounts) is on the Desktop: `gym tracker example.html`. Your training plan, converted to the import format, is at `~/Desktop/workout-plan.xlsx`.

---

## 1. Decisions (keep it simple)

| Topic | Decision | Why |
|---|---|---|
| Frontend | Plain HTML + CSS + vanilla JS, no build step | The mockup is already written this way; nothing to compile |
| Hosting | Fly.io, one tiny Caddy container that sleeps when idle | Chosen stack; costs cents to about $2 a month |
| Accounts | Supabase Auth, **email + password** | No OAuth apps to register, works on any device |
| Email confirmation | **Off at launch** | Sign up and log in work without sending any email |
| Password reset emails | Supabase's built-in sender to start, a free sender (Brevo or Resend) when real users join | Built-in sender is limited to a few emails an hour |
| Database | Supabase Postgres, called directly from the browser | No backend code to write or host |
| Data isolation | Row Level Security (RLS) on every table | Each account can only ever read and write its own rows |
| Excel | SheetJS, only for imports, templates and backups | Excel is no longer the database |
| Charts | Plain SVG drawn by the app | No chart library |

What we are **not** building in v1, on purpose: social login, teams or sharing between accounts, a native app, push notifications, a custom backend.

---

## 2. Architecture

```
 Browser (phone or laptop)
   │  index.html + app.js + style.css
   │
   ├── HTTPS ──>  Fly.io      Caddy serves the static files. Sleeps when idle.
   │
   └── HTTPS ──>  Supabase    Auth: sign up, log in, sessions, password reset
                              Postgres: plan + history, RLS per account
                              Called directly with supabase-js
```

- The browser downloads the page from Fly.io, then talks to Supabase directly.
- **Fly.io never sees any data.** It only serves files.
- **Supabase** checks the logged-in user's token on every request. RLS makes Postgres return only that user's rows.

### Project layout

```
gym-tracker/
  public/
    index.html
    style.css
    config.js            <- Supabase URL + public key
    app.js               <- startup + routing between pages
    js/
      supabase.js        <- creates the client
      auth.js            <- sign up, log in, log out, reset, account
      db.js              <- every read/write to Supabase
      outbox.js          <- queues writes when offline
      cache.js           <- per-account local copy for instant start
      import.js          <- Excel import, preview, templates, backup
      views/*.js         <- one file per page (dashboard, plan, workouts, ...)
      ui/*.js            <- shared pieces (cards, check-ins, sleep dial, charts, forms)
    examples/
      example-plan.json  <- "Start from an example plan" for new accounts
  supabase/
    schema.sql           <- tables, checks, RLS, functions (section 4)
  Caddyfile
  Dockerfile
  fly.toml
  .github/workflows/keep-alive.yml
```

The mockup is one file; splitting it into these files is mechanical. `db.js`, `auth.js`, `outbox.js` and `cache.js` are new.

---

## 3. Accounts

### 3.1 What a user can do

| Action | Where | Supabase call |
|---|---|---|
| Create account | Auth screen, "Create account" tab | `auth.signUp({ email, password })` |
| Log in | Auth screen, "Log in" tab | `auth.signInWithPassword({ email, password })` |
| Stay logged in | Automatic, per device | supabase-js keeps the session and refreshes it |
| Log out | Settings | `auth.signOut()` |
| Forgot password | Auth screen, "Forgot password?" | `auth.resetPasswordForEmail(email, { redirectTo: SITE_URL })` |
| Set a new password | Opens from the reset email link | `auth.updateUser({ password })` after the `PASSWORD_RECOVERY` event |
| Change password | Settings | `auth.updateUser({ password })` |
| Delete account and all data | Settings, type DELETE to confirm | `rpc('delete_my_account')`, then `auth.signOut()` |

### 3.2 Screens

**Auth screen** (shown whenever there's no session):
- App logo and name, one card with two tabs: **Log in** and **Create account**.
- Fields: email, password (with show/hide). Create account adds "at least 8 characters".
- "Forgot password?" link under Log in: asks for the email, sends the link, then shows "If an account exists for this email, a reset link is on its way."
- Errors in plain language:

| Supabase error | Shown to the user |
|---|---|
| Invalid login credentials | Wrong email or password. |
| User already registered | An account with this email already exists. Log in instead. |
| Password should be at least 8 characters | Use at least 8 characters. |
| Email rate limit exceeded | Too many emails were sent. Try again in an hour. |
| Network error | No connection. Check your internet and try again. |

**Set new password screen**: one password field and a Save button, shown after opening a reset link.

**Settings → Account card**: signed-in email, Change password, Log out, Delete account (red, asks you to type DELETE).

### 3.3 New account onboarding

A new account has no plan, so the Dashboard shows a **Welcome** card instead of the check-ins:
1. **Workout plan:** "Import workout plan" (the Excel template) or "Start from an example plan".
2. **Diet, supplements and sleep:** "Import" or "Set up later".
3. **Done:** the normal Dashboard appears.

On first load the app creates the account's `sleep_plan` row with a default of 23:00 to 07:00, so sleep works straight away.

### 3.4 Supabase Auth settings (dashboard)

- **Authentication → Sign In / Providers → Email:** enabled. **Confirm email: off** (see 3.5). Minimum password length: 8.
- **Allow new users to sign up: on** (this is a multi-account app).
- **URL Configuration:**
  - Site URL: `https://<your-app>.fly.dev` (or your domain).
  - Redirect URLs: the same URL, plus `http://localhost:8080` for local testing.
- **Client:** supabase-js with `flowType: 'pkce'`. The app uses `#dashboard`-style links for pages, and PKCE puts the reset code in `?code=...` instead of the `#`, so the two don't clash.

### 3.5 Email: confirmation and password reset

- **At launch (simplest):** confirmation off, so nobody needs an email to sign up or log in. The only email the app sends is the password reset, through Supabase's built-in sender. It's meant for testing and allows only a few emails an hour, which is fine while it's you and a few friends.
- **When real users join:** set **custom SMTP** in Supabase (Authentication → Emails → SMTP). Both options are free:
  - **Brevo:** verify one sender address. No domain needed.
  - **Resend:** about 3,000 emails a month, 100 a day. Needs a domain you own.
- **Then optionally turn Confirm email on**, so people can only sign up with an address they really own.
- **If fake sign-ups ever become a problem:** turn on CAPTCHA in Supabase Auth with Cloudflare Turnstile (free). It's one setting plus a widget on the Create account form.

### 3.6 Sessions, cache and logging out
- The session lives in the browser (supabase-js handles storage and token refresh).
- Local cache and the offline queue are stored **per account**: `gym_cache_<userId>` and `gym_outbox_<userId>`. Two people sharing a laptop never see each other's data.
- **Log out** clears that account's cache. If the offline queue still has unsent changes, the app warns first: "3 changes aren't synced yet. Log out anyway?"

---

## 4. Database

Everything below goes in `supabase/schema.sql` and is run once in the Supabase SQL editor.

### 4.1 Tables

Every table has `id`, `user_id` (the owner, filled in automatically from the logged-in user) and `created_at`. Deleting an account deletes all its rows (`on delete cascade`).

```sql
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
  reps       text not null check (reps ~ '^[0-9]{1,3}(-[0-9]{1,3})?$'),
  rest       text not null default '' check (char_length(rest) <= 20),
  execution  text not null default '' check (char_length(execution) <= 300),
  created_at timestamptz not null default now()
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

-- ---------- indexes for the common queries ----------
create index on public.workout_days (user_id, position);
create index on public.exercises (day_id, position);
create index on public.workout_sessions (user_id, date);
create index on public.food_log (user_id, date);
create index on public.supplement_log (user_id, date);
```

### 4.2 Row Level Security

```sql
-- every table: you only see and change your own rows
do $$
declare t text;
begin
  foreach t in array array['workout_days','exercises','diet_plan','regulars','sleep_plan',
                           'workout_sessions','food_log','supplement_log','sleep_log'] loop
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
```

Logged-out visitors (the `anon` role) have no policy, so they can read nothing.

### 4.3 Functions

```sql
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
      insert into exercises (day_id, position, name, sets, reps, rest, execution)
      values (new_day, j, e->>'name', (e->>'sets')::int, e->>'reps',
              coalesce(e->>'rest', ''), coalesce(e->>'execution', ''));
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
```

- The two import functions run as the logged-in user (`security invoker`), so RLS still applies.
- `delete_my_account` needs `security definer` to delete the login itself. It only ever deletes `auth.uid()`, the caller's own account.

---

## 5. Frontend data layer

### 5.1 Startup
1. `config.js` provides `SUPABASE_URL` and the public key (anon / publishable key).
2. `supabase.js` creates the client: `createClient(url, key, { auth: { flowType: 'pkce', persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } })`. supabase-js is loaded from a CDN with a pinned version (`@supabase/supabase-js@2.x.y`).
3. `auth.onAuthStateChange`:
   - `SIGNED_IN` / `INITIAL_SESSION` with a user: show the cached data for this account, then load fresh data.
   - No session: show the Auth screen.
   - `PASSWORD_RECOVERY`: show the Set new password screen.
   - `SIGNED_OUT`: clear the account cache and show the Auth screen.

### 5.2 Loading data
- All tables load in parallel after login (RLS returns only your rows).
- **The plan** (workout days, exercises, diet, regulars, sleep plan) loads completely. It's small.
- **History** loads the **last 90 days** only, which covers every view: the 4-week calendar, 30-day charts and the supplement grid. "Show older" buttons fetch earlier pages with `.range()`. Supabase returns at most 1,000 rows per request by default, so this keeps every request well under that.
- If the account has no `sleep_plan` row, insert the default (`upsert` with `ignoreDuplicates`).

### 5.3 Writing data
- **The screen updates first, then the change is written to Supabase**, so taps feel instant.
- **Ids are created in the browser** (`crypto.randomUUID()`) and writes are **upserts on `id`**. Sending the same write twice is harmless, which makes retries safe.
- **One action = one small request.** No more saving the whole state at once.

| User action | Request |
|---|---|
| Mark workout as done | `workout_sessions.upsert({ id, date, day_id, name })` |
| Undo workout | `workout_sessions.delete().eq('id', id)` |
| Tick a supplement | `supplement_log.upsert({ id, date, time, supplement, dose, unit })` |
| Untick a supplement | `supplement_log.delete().eq('date', d).eq('supplement', name)` |
| Slept as planned / sleep dial | `sleep_log.upsert({ id, date, bed, wake, hours }, { onConflict: 'user_id,date' })` |
| Log a planned meal / add food | `food_log.upsert({ ... })` |
| Edit or delete any row | `update` / `delete` by `id` |
| Edit plan (day, exercise, meal, supplement, sleep) | `upsert` / `delete` on the plan table |
| Reorder exercises | `exercises.upsert([{ id, position }, ...])` |
| Workout import | `rpc('replace_workout_plan', { days })` |
| Diet / supplements / sleep import | `rpc('replace_other_plan', { diet, regs, sleep })` |

### 5.4 Offline (bad signal at the gym)
- **When a write fails because there's no connection,** it goes into the account's outbox (`gym_outbox_<userId>`) and a small "Not synced yet" badge appears in the top bar.
- **The outbox is replayed in order** when the browser comes back online (`online` event), when the app opens, and every 30 seconds while it isn't empty.
- **A write rejected by the database** (for example a failed check) is dropped from the outbox, and the user sees a message. It isn't retried forever.
- **Imports and account actions need a connection** and say so if you're offline.

### 5.5 Instant start
- After every successful load or write, the account's data is saved to `gym_cache_<userId>`.
- On the next visit the app shows the cached data immediately, then refreshes from Supabase.

---

## 6. Importing your plan

Two separate files, each with its own button and template (on the Plan page and in Settings):

| File | Button | Sheets and columns |
|---|---|---|
| `workout-plan.xlsx` | Import workout plan | **Workout:** Day, Focus, Exercise, Sets, Reps, Rest, Execution |
| `gym-plan.xlsx` | Import diet, supplements & sleep | **Diet:** Meal, Food, Calories, Protein (g), Carbs (g), Fat (g). **Supplements:** Supplement, Dose, Unit, When. **Sleep:** Bed time, Wake time |

**The workout file:**
- One row per exercise. Rows that share a Day become one card. Keep a day's rows together; a blank Day continues the day above.
- **Focus** describes the day ("Width & upper chest") and only needs to be on the first row of a day.
- **Reps** can be `8` or `8-12`. **Rest** and **Execution** are optional.
- **A rest day** is a row with only the Day filled in, e.g. `Rest`.
- Extra sheets are ignored, so the file can carry a "Program notes" sheet.

**How an import runs:**
1. The file is read and checked **in the browser** with SheetJS. Nothing is sent yet.
2. Mistakes are listed by sheet and row (`Workout row 3: Sets must be a number above 0 (found "four")`), and the import stays blocked until they're fixed.
3. A preview shows what will happen ("6 workouts, 2 rest days, 39 exercises", each day with its exercises, "Not in the file, stays as it is").
4. On **Replace**, one RPC writes it in a single transaction. If anything fails, nothing changes.
5. Your history is never touched. Re-importing the same plan keeps finished workouts attached to their cards (matched by day name).

**Templates** come pre-filled with the account's current plan, so they double as a backup of the plan. Formats are matched loosely: header names (`Execution`, `Notes` and `Cue` all work), `82,5` and `82.5`, and times as `23:00`, `11:30 PM` or Excel time cells. A file put into the wrong import gets a hint pointing to the right one.

---

## 7. Screens

Navigation: a left sidebar on desktop, a bottom tab bar on phones (Settings moves to a top-bar button).

**Dashboard | Plan | Workouts | Calories | Supplements | Sleep | Settings**

The sidebar shows live badges: calories as % of goal, supplements taken today (2/4), and a ✓ on Workouts and Sleep once today's is logged.

- **Auth / Set new password:** section 3.2.
- **Dashboard:**
  - Calories, Protein and Last night cards with progress rings.
  - **Daily check-in:** Last night ("Slept as planned" or the sleep dial), Workout (a chip per workout, tap the one you did) and Supplements (checklist).
  - New accounts see the Welcome card instead (3.3).
- **Plan:** four tabs, **Workout, Diet, Supplements, Sleep**. Import and template buttons follow the open tab.
  - Workout days are cards in edit mode: edit a day's name and focus; add, edit, reorder or delete exercises; add rest days.
- **Workouts:**
  - Your plan as cards, one per day, with total sets and a table of exercises (sets, reps, rest, execution cue).
  - **Mark as done** on each card; the card turns green and shows when it was last done. Rest days are small dashed cards.
  - Workouts in the last 7 and 30 days, a Monday to Sunday calendar of the last 4 weeks, the finished-workouts list, and "+ Past workout".
- **Calories:**
  - Today's stats and **Today's meal plan** with a one-tap Log per meal.
  - 30-day chart and history.
- **Supplements:**
  - Today's checklist and streaks.
  - A **history grid** (one row per supplement, one column per day; tap a square to fix a past day).
  - **Log by day.**
- **Sleep:**
  - Last night check-in.
  - Stat cards: 7-day average, average bedtime vs plan, nights on goal.
  - 30-day chart and history.
  - The **sleep dial** for times: a 24-hour clock with a moon and a sun to drag.
- **Settings:**
  - **Account:** email, change password, log out, delete account.
  - Both imports with templates.
  - Daily goals (from the plan).
  - **Download backup (.xlsx)** with every table as a sheet.
  - Clear all logged entries.

Everything is editable: every log entry has edit and delete, every part of the plan can be changed or re-imported, and every check-off can be undone with a second tap.

---

## 8. Deployment, step by step

### 8.1 Supabase
1. Sign up at supabase.com and create a project (free plan, region close to you, e.g. Frankfurt). Save the database password somewhere safe.
2. **SQL Editor:** paste `supabase/schema.sql` and run it.
3. **Authentication:** apply the settings from 3.4.
4. **Project Settings → API:** copy the **Project URL** and the **anon / publishable key** into `public/config.js`:
   ```js
   window.GYM_CONFIG = {
     supabaseUrl: 'https://<project-ref>.supabase.co',
     supabaseKey: '<anon or publishable key>',
   };
   ```
   This key is public by design: RLS is what protects the data. The **service_role / secret key** must never be in this file or in git.

### 8.2 Fly.io
1. Install flyctl (`brew install flyctl`), then `fly auth signup` (or `fly auth login`).
2. Add these three files:

   **Dockerfile**
   ```dockerfile
   FROM caddy:2-alpine
   COPY Caddyfile /etc/caddy/Caddyfile
   COPY public /srv
   ```

   **Caddyfile**
   ```
   :8080 {
     root * /srv
     encode zstd gzip
     file_server
     header /index.html Cache-Control "no-cache"
     header /config.js Cache-Control "no-cache"
     header {
       X-Content-Type-Options nosniff
       Referrer-Policy strict-origin-when-cross-origin
       X-Frame-Options DENY
     }
   }
   ```

   **fly.toml**
   ```toml
   app = "gym-tracker-<yourname>"
   primary_region = "fra"

   [http_service]
     internal_port = 8080
     force_https = true
     auto_stop_machines = "stop"
     auto_start_machines = true
     min_machines_running = 0

   [[vm]]
     size = "shared-cpu-1x"
     memory = "256mb"
   ```
3. `fly launch --no-deploy` (keep the existing fly.toml), then `fly deploy`.
4. `fly scale count 1`. Fly creates two machines by default; one is plenty for a static site and halves the cost.
5. Open `https://gym-tracker-<yourname>.fly.dev`, then put that URL in Supabase as the Site URL and a Redirect URL (3.4).
6. **Billing alert:** set one in the Fly dashboard (Organization → Billing).
7. **Optional custom domain:** `fly certs add gym.yourdomain.com`, then add the DNS record it prints. Update the Supabase URLs to match.

**Updating the app later:** change files in `public/`, run `fly deploy`. Optionally a GitHub Action runs `fly deploy` on every push to `main`, using a `FLY_API_TOKEN` secret.

### 8.3 Keep Supabase awake

A free project pauses after 7 days without activity. While people use the app daily that won't happen, but a quiet week would take the app down until you restore it in the dashboard. `.github/workflows/keep-alive.yml` makes one small API request every 3 days:

```yaml
name: keep-alive
on:
  schedule: [{ cron: '0 6 */3 * *' }]
  workflow_dispatch:
jobs:
  ping:
    runs-on: ubuntu-latest
    steps:
      - run: >
          curl -fsS "${{ secrets.SUPABASE_URL }}/rest/v1/workout_days?select=id&limit=1"
          -H "apikey: ${{ secrets.SUPABASE_KEY }}" > /dev/null
```

It uses the public key, so it returns no rows (RLS). Check after the first quiet week that the project stays active; if it doesn't, change the ping to a real query.

### 8.4 Backups
- **Free projects have no automatic backups.**
- **For users:** Settings → **Download backup (.xlsx)** exports their own data.
- **For you (all accounts):** an optional weekly GitHub Action runs `pg_dump` with the database connection string (from GitHub Secrets) and keeps the file as a workflow artifact.

### 8.5 Fully free option

If the couple of dollars on Fly.io ever matter, the same `public/` folder can go to **Cloudflare Pages** or **Netlify** for free. Upload the folder, update the Site URL in Supabase, and nothing else changes.

---

## 9. Costs and limits

| Service | Cost | Limits that matter here |
|---|---|---|
| Fly.io | No free tier for new accounts. With the machine stopping when idle, roughly cents to ~$2 / month | Set a billing alert |
| Supabase | Free | 500 MB database (years of logs per user are a few MB), 2 projects, pauses after 7 days idle, no automatic backups |
| Email (Brevo / Resend) | Free | Resend: about 3,000 / month, 100 / day, needs a domain. Brevo: needs a verified sender |
| GitHub Actions | Free | Keep-alive and backup jobs use a few minutes a month |
| Domain (optional) | ~$10 / year | Only needed for Resend or a nicer URL |

These numbers come from 2026 pricing pages and can change; recheck before launch.

---

## 10. Security checklist

- [ ] RLS enabled on **every** table (section 4.2). In the dashboard, every table shows "RLS enabled".
- [ ] No table has a policy for the `anon` role.
- [ ] The service_role / secret key is not in `public/`, not in git, only in GitHub Secrets.
- [ ] Minimum password length 8.
- [ ] Site URL and Redirect URLs list only your real URLs (plus localhost).
- [ ] The app inserts all user text with `textContent` or escaping, never raw HTML (the mockup's `esc()` helper).
- [ ] Logging out clears that account's cache.
- [ ] Delete account removes the login and all rows (test it).

---

## 11. Test plan

**Accounts:**
- [ ] Create account → lands on the Welcome card.
- [ ] Log out → log in again → same data.
- [ ] Wrong password → "Wrong email or password."
- [ ] Sign up with an existing email → friendly message.
- [ ] Forgot password → email arrives → link opens Set new password → can log in with it.
- [ ] Change password in Settings works.
- [ ] Delete account → can't log in, rows are gone in the Table Editor.

**Isolation (do this with two accounts, A and B):**
- [ ] B sees none of A's plan or history.
- [ ] In the browser console as B, `supabase.from('food_log').select()` returns only B's rows.
- [ ] As B, inserting an exercise with one of A's `day_id`s is rejected.
- [ ] Logged out, any `select` returns no rows.

**App:**
- [ ] Import `workout-plan.xlsx` → "6 workouts, 2 rest days, 39 exercises", cards render.
- [ ] Mark as done / undo, past workout, supplement ticks, sleep check-in and dial, meal log all survive a page reload.
- [ ] Re-import the same workout plan → finished workouts still show on the cards.
- [ ] Phone (390 px): bottom tabs, check-ins, sleep dial and cards work.

**Offline:**
- [ ] Airplane mode → tap Mark as done → "Not synced yet" → back online → syncs, badge disappears.

**Deploy:**
- [ ] The site loads over HTTPS, wakes from sleep in about a second, and the keep-alive workflow succeeds.

---

## 12. Build phases

Each phase ends with something that works.

1. **Supabase foundation**
   - Create the project, run `schema.sql`, set up Auth (3.4).
   - **Done when:** two test accounts exist in the dashboard and the isolation tests pass from the SQL editor.
2. **Deploy the shell**
   - Dockerfile, Caddyfile, fly.toml.
   - Deploy the current mockup to Fly.io.
   - **Done when:** the mockup opens at the fly.dev URL over HTTPS.
3. **Accounts**
   - `auth.js`: auth screen, sign up, log in, log out, forgot and reset password, change password, delete account.
   - Per-account cache keys.
   - **Done when:** the account tests in section 11 pass.
4. **Data layer**
   - `db.js`: load the plan and the last 90 days, per-row upserts and deletes, the two import RPCs.
   - Replace the mockup's single localStorage save.
   - **Done when:** everything survives a reload and shows up on a second device.
5. **Screens on real data**
   - Port page by page: Plan + imports, Workouts, check-ins (sleep, supplements, meals), Dashboard + Welcome card, Settings + backup download.
   - **Done when:** the app tests in section 11 pass.
6. **Reliability and launch**
   - Outbox + "Not synced yet" badge, keep-alive workflow, Fly billing alert, custom SMTP for password resets.
   - **Done when:** the offline and deploy tests pass. Then invite users.

---

## 13. Later ideas (not in v1)

- Google / Apple login (Supabase supports both; needs OAuth app setup).
- Week of the program and RIR target on each card (from the "Program notes" schedule).
- "Up next" hint on the workout that follows the last one done.
- Install on the phone home screen (PWA manifest + service worker, which also makes the page itself load offline).
- Body weight and measurements.
- Sharing a plan with another account (copy a plan by link).
