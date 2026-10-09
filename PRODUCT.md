# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

- **Primary:** Aman and a small, invited circle of friends preparing for software-engineering
  interviews across DSA, system design, CS core, Java and SQL. Each runs a personal
  30/60/90-day campaign.
- **Situation:** studying while working or job-hunting, on a phone most of the time and a
  desktop some of the time; wants each day's work decided rather than chosen from scratch.
- **Job to be done:** "Tell me exactly what to do today, check my answers honestly, and only
  tell me I'm ready when I've actually done the work."

## Product Purpose

90x is interview prep that plans your day and checks your answers. Pick a campaign length;
90x picks today's missions from your weakest areas, grades what you answer on Feed cards,
schedules reviews with FSRS, and tracks a readiness score per area. Success means consistent
daily practice that moves a measured readiness number — not time spent in the app.

## Positioning

A campaign, not a library. Neighbouring products give you a problem list or a flashcard deck;
90x decides each day's work from a weekday template, your weakest patterns and a weekly focus,
grades answers (by rule where it can, against source-grounded key points where it must use
AI), and raises readiness only on work actually done. The coach answers by searching the library and citing what it used, and every change
it proposes needs a tap first.

## Operating Context

- Mobile-first PWA (installable, push, offline Today and Feed), dark only, used in short daily
  sessions; desktop is the second surface. It is built to feel like a native app: tabs answer
  on the tap, skeletons stand in while data loads, and actions update at once.
- **Front door:** a public landing page at `/` (a pinned demo, a Feed wall, Google sign-in, and a
  short developer note saying the app is calmer than the page). Signed-in visitors skip it and
  land on Today. Privacy, terms and delete-my-account pages are public.
- Daily loop: **Today** → do missions → check in. Each day's missions are the weekday template's
  slots (new problems, due reviews, a topic; a planned problem left unsolved stays in Missions until it is solved) plus one fixed **"10 cards"** mission. The Sunday
  weekly review sets a **weekly focus** (patterns and topics) that one problem and topic a day
  lean on. **"+ Add a problem"** is always on Today and adds an extra problem to an **Extras**
  list that carries over until it is solved or removed; extras never change the day. A missed day can be **revived** by doing its missions as extras,
  and the offer can be closed.
- **XP** rewards work done: a first solve 30 (20 with hints), a due review 15, a topic 20, a
  correct Feed card 2 (1 if the AI marked it), and 20 for finishing the day. Self-ratings,
  declarations and skips earn nothing, and XP never comes from an AI-graded answer alone. Me
  shows a total and a week chart.
- **Feed** is a stream of spaced-repetition cards answered in ten ways (pick one, order, match,
  bucket, tap in place, assemble, numeric, claim grid, grid toggle, compose), with an
  Easier / Standard / Harder setting. Each served 10 holds at most 6 of one card kind and, with
  four or more areas on, at most 3 of one area; new cards take turns across areas. The mix is
  about 50% weak areas, 30% due reviews, 20% new. After an answer you can star the card or
  report a problem. Once a day, after enough cards, a banner points back to Today's missions.
- **Library** has area tabs (DSA, Design, CS, Java, SQL, LLD, AI, Behavioural, Competitive) and
  search. DSA has the Pattern Map and a pattern dropdown over problem rows; other areas list
  topics in sections with progress rings; Competitive is one flat list with x of y solved.
- **Coach** is chat, pattern lessons, solution review, design and behavioural mocks, a STAR
  story bank, and a Sunday weekly read with proposed plan changes.
- **Friends** compares progress (readiness, streak, solved this week, last mock) and shares
  check-in activity without notes. Invites go by email; on a phone it is reached from Me.
- Lesson and card text draws on 44 public sources, credited in the app and in NOTICE.
- LeetCode sync is optional; manual check-ins always work. Sign-in is Google, and new accounts
  wait for admin approval (or are approved automatically when an admin turns that on).
- Account: settings for notifications (push, evening streak, friend activity, weekly review),
  an in-app report-a-problem form, and delete-my-account.

## Capabilities and Constraints

- **Shipped:** landing page, Today + 90 Grid, Missions (daily "10 cards", weekly focus, extras,
  revive), XP, readiness per area, Feed v2 (ten answer types, FSRS, difficulty setting, mix
  rules, card stars, report a problem), Library (3,693 problems, 273 lessons, Pattern Map, AI sections), check-ins, LeetCode sync, Coach (tool-using chat, memory,
  solution review, pattern lessons, text mocks, STAR story bank, weekly review), Friends, web
  push, install prompts, offline Today/Feed, legal pages and delete-my-account, admin approval,
  card review, settings and analytics.
- **Readiness:** an area's score is coverage times recent accuracy; the overall number is a
  weighted average of the areas that have data (DSA 35, Design 25, CS 20, Java 15, SQL 5).
  Bands: under 40 not yet, 40 to 69 getting there, 70 and up ready.
- **Constraints:** dark theme only; open sign-up (admins can switch on approval, block or delete accounts); AI use is metered and
  capped on the server, with an admin pause switch, so the AI features can slow or stop but
  nothing the reader earns depends on them; server code bypasses RLS so every query is scoped to
  the viewer; content must be source-grounded.
- **Accessibility:** WCAG 2.1 AA scan runs in CI (axe-core + Playwright); reduced-motion
  respected; tabular numerals for data.

## Brand Commitments

- Name: **90x**. The mark is "90" plus an x stroke.
- Voice: precise, calm, direct. It is a coach, not a hype machine — no gamification beyond the
  90 Grid and plain XP numbers (no badges, no exclamation).
- Cool signal-cyan accent on near-black; Sora for titles and numbers, Manrope for everything
  else.

## Evidence on Hand

- **Absences:** no testimonials, customers, benchmarks, press or pricing. Do not fabricate any.

## Product Principles

1. **The plan decides, you execute.** Each day's work is chosen for you from your template and
   your weak spots.
2. **Readiness is earned.** The number moves on completed work and accuracy, never on time spent
   or self-report.
3. **Checked, not claimed.** Answers are graded against source-grounded key points; the coach
   cites what it used.
4. **Nothing changes without your tap.** Coach actions and weekly plan changes are proposed,
   never applied silently.
5. **Private by default.** You see your own notes, chats, memory and reviews; friends see scores,
   not substance.

## Accessibility & Inclusion

WCAG 2.1 AA (axe-core scan in CI), visible keyboard focus, motion respects
`prefers-reduced-motion`, phone-first touch targets, and iOS safe-area padding so installed-app
screens start below the status bar.
