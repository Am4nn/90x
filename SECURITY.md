# Security

90x is an invite-only interview-prep app. This file records the threat model, the
trust boundaries the code relies on, and the decisions a future change must not
reverse by accident.

## Threat model

Actors: an anonymous visitor, a pending or rejected user, an approved user, a
*friend* (who may see some rows), an admin, QStash, and an attacker holding a
session.

Assets: a user's own notes, check-ins, card answers, coach threads, memory,
stories, mock transcripts, push subscriptions, and the shared monthly AI budget.

## Trust boundaries

- **The database.** Drizzle connects as a role row-level security does not apply
  to, so the boundary is each query's `WHERE user_id = viewer.id`, not the
  database. Every server query is scoped to the signed-in user (from
  `requireViewer()` in `@/lib/auth/viewer`) or is admin-only behind
  `viewer.isAdmin` (return `notFound()` to everyone else).
- **HTTP.** A page must never render private data to a signed-out or non-owner
  visitor; a route must never answer a forged or missing signature. The
  security headers are set in `web/next.config.ts` and asserted by the break-in
  sweep.
- **The model prompt.** The display name and coach memory are user-controlled and
  can reach another user's model context. `sanitizeForPrompt` in
  `@/lib/coach/prompt-safety` strips control and bidi characters at that
  boundary.
- **Cost.** Paid model calls are bounded per user by `@/lib/upstash/rate-limit`
  (solution review, mock scoring, grading) and `@/lib/coach/rate-limit` (chat).

## Breaking in, on purpose

`bun run break-in` attacks the app and fails the build if anything gives:

```bash
bun run break-in                              # direct round against a local Supabase
bun run break-in --http=http://localhost:3000 # direct + the HTTP sweep
```

It builds its own users and rows and removes them all at the end, so it runs
against any throwaway database. CI runs the direct round beside the database
checks and the HTTP sweep in the e2e job.

## Rate-limit failure decisions

| Limiter | Fails | Why |
|---|---|---|
| Coach chat (`@/lib/coach/rate-limit`) | open | A Redis blip should not silence the coach; the monthly budget still caps spend. |
| Review / mock / grading (`@/lib/upstash/rate-limit`) | closed | These are paid calls with no other per-user bound; running them unmetered is worse than refusing. |

## Test sign-in

`/api/test/sign-in` mints sessions for the Playwright suite and ships in every
build. It answers only when all four hold: `E2E=1`, `VERCEL` unset,
`NEXT_PUBLIC_SUPABASE_URL` is the local CLI stack, and `ALLOW_TEST_SIGN_IN=1`.
Only the e2e CI job sets all four.

## Known gaps

- **No nonce-based Content-Security-Policy.** The App Router emits inline
  bootstrap scripts, so a full policy needs a per-request nonce and a wrong one
  blanks the page. We ship `frame-ancestors 'none'` and the other headers now;
  a nonce CSP is the next step.
