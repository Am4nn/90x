# 90X

Personal interview-prep app: daily missions, attempt tracking, AI mock interviews and a question feed.


## Layout

```
supabase/    migrations, seed, config
web/         Next.js app (bun)
```

## Setup

Needs Bun, uv, and Docker (for local Supabase).

```bash
# Web app
cd web
bun install
cp .env.example .env.local   # fill in values
bun run db:start             # local Supabase
bun run dev

```

## Web scripts

| Script | Does |
|---|---|
| `dev`, `build`, `lint`, `typecheck`, `test` | the usual |
| `db:start` / `db:stop` | local Supabase |
| `db:new <name>` | new SQL migration |
| `db:reset` | rebuild local DB from migrations + seed |
| `db:push` | apply migrations to the linked cloud project |
| `db:pull` | pull schema into Drizzle types |
| `db:types` | generate supabase-js types |
