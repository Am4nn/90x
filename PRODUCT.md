# Product

## Platform

Web. A mobile-first, installable PWA with a desktop layout.

## Who it is for

- **Primary:** people preparing for software-engineering interviews across DSA, system design,
  CS core, Java and SQL, who each run a personal 30/60/90-day campaign.
- **Situation:** studying while working or job-hunting, on a phone most of the time and a
  desktop some of the time. They want each day's work decided rather than chosen from scratch.
- **Job to be done:** "Tell me exactly what to do today, check my answers honestly, and only
  tell me I'm ready when I've actually done the work."

## What it is

90x is interview prep that plans your day and checks your answers. You pick a campaign length.
90x picks today's missions from your weakest areas, grades what you answer on Feed cards,
schedules reviews with FSRS, and tracks a readiness score per area. Success means consistent
daily practice that moves a measured readiness number, not time spent in the app.

A campaign, not a library. Neighbouring products give you a problem list or a flashcard deck.
90x decides each day's work from a weekday template, your weakest patterns and a weekly focus.
It grades answers by rule where it can, and against source-grounded key points where it must
use AI. Readiness rises only on work actually done. The coach answers by searching the library
and citing what it used, and every change it proposes needs a tap first.

The library holds 3,693 problems, 273 lessons. Lesson and card text draws on 44 public sources,
credited in the app and in NOTICE. The code is MIT licensed.

## What it does

The mobile tab bar has five tabs: Today, Feed, Library, Coach, Me. Desktop adds Friends to a
sidebar. On a phone, Friends is reached from Me.

### Front door

A public landing page at `/` shows a pinned demo, a Feed wall, Google sign-in and a short
developer note. Signed-in visitors skip it and land on Today. Privacy, terms and
delete-my-account pages are public. Sign-in is Google. Sign-up is open; admins can switch on
approval, and can block or delete accounts.

### Today and Missions

- Each day's missions are the weekday template's slots (new problems, due reviews, a topic)
  plus one fixed "10 cards" mission. A planned problem left unsolved stays in Missions until it
  is solved.
- The Sunday weekly review sets a weekly focus (patterns and topics) that one problem and one
  topic a day lean on.
- "+ Add a problem" is always on Today. It adds an extra problem to an Extras list that carries
  over until it is solved or removed. Extras never change the day's status.
- A missed day can be revived by doing its missions as extras. The offer can be closed.
- "Add with Coach" sits under Extras: say what you want, Coach proposes up to three, and only
  the ones you leave ticked are added.
- The 90 Grid shows one square per campaign day. Check-ins are manual, and LeetCode sync is
  optional.
- XP rewards work done: a first solve 30 (20 with hints), a due review 15, a topic 20, a correct
  Feed card 2 (1 if the AI marked it), and 20 for finishing the day. Self-ratings, declarations
  and skips earn nothing, and XP never comes from an AI-graded answer alone.

### Feed

- A stream of spaced-repetition cards answered in ten ways: pick one, order, match, bucket, tap
  in place, assemble, numeric, claim grid, grid toggle, compose.
- An Easier / Standard / Harder setting.
- Each served set of 10 holds at most 6 of one card kind and, with four or more areas on, at
  most 3 of one area. New cards take turns across areas. The mix is about 50% weak areas, 30%
  due reviews, 20% new.
- After an answer you can star the card or report a problem.
- Once a day, after enough cards, a banner points back to Today's missions.

### Library

- Area tabs (DSA, Design, CS, Java, SQL, LLD, AI, Behavioural, Competitive) and search.
- DSA has the Pattern Map and a pattern dropdown over problem rows. Other areas list topics in
  sections with progress rings. Competitive is one flat list with x of y solved.
- **Audio lessons:** lessons can be listened to. A mini player persists across pages, a full
  player has a transcript and six playback speeds (0.8x to 2x), and a lesson can be downloaded
  for offline listening.

### Coach

- Chat that uses tools: it searches the library, cites what it used, and keeps memory you can
  see and edit.
- Pattern lessons, solution review, design and behavioural mock interviews, and a STAR story
  bank.
- A Sunday weekly read with proposed plan changes.

### Friends

Compares progress (readiness, streak, solved this week, last mock) and shares check-in activity
without notes. Invites go by email.

### Me

XP total and a week chart, readiness, settings for notifications (push, evening streak, friend
activity, weekly review), time zone, the STAR stories, an in-app report-a-problem form, and
delete-my-account. Admins get a link to the admin area (approval, users, card review, reports,
mail, settings, analytics).

### The public /try demo

`/try` lets a visitor try a real card and a short lesson with no account. It has tabs for
System design, DSA and SQL, a Listen option on phones, and a pinned bar that leads to sign-up.

### Platform behaviour

Installable, with push notifications, and offline Today and Feed. It is built to feel native:
tabs answer on the tap, skeletons stand in while data loads, and actions update at once.

## Readiness

An area's score is coverage times recent accuracy. The overall number is a weighted average of
the areas that have data (DSA 35, Design 25, CS 20, Java 15, SQL 5). Bands: under 40 not yet,
40 to 69 getting there, 70 and up ready.

## Constraints

- Dark theme only.
- AI use is metered and capped on the server, with an admin pause switch. The AI features can
  slow or stop, but nothing the reader earns depends on them.
- Server code bypasses RLS, so every query is scoped to the viewer.

## Brand

- Name: **90x**. The mark is "90" plus an x stroke.
- Voice: precise, calm, direct. It is a coach, not a hype machine. No gamification beyond the
  90 Grid and plain XP numbers (no badges, no exclamation).
- Cool signal-cyan accent on near-black; Sora for titles and numbers, Manrope for everything
  else. See `DESIGN.md`.

## Evidence on hand

The numbers the landing page shows: 3,693 problems, 273 lessons, 44 sources, and a link to the
code on GitHub (MIT).

**Absences:** no testimonials, customers, user counts, ratings, benchmarks, press or pricing.
None are invented.

## Product principles

1. **The plan decides, you execute.** Each day's work is chosen for you from your template and
   your weak spots.
2. **Readiness is earned.** The number moves on completed work and accuracy, never on time spent
   or self-report.
3. **Checked, not claimed.** Answers are graded against source-grounded key points, and the
   coach cites what it used.
4. **Nothing changes without your tap.** Coach actions and weekly plan changes are proposed,
   never applied silently.
5. **Private by default.** You see your own notes, chats, memory and reviews. Friends see scores,
   not substance.

## Accessibility and inclusion

WCAG 2.1 AA (an axe-core scan runs in CI), visible keyboard focus, motion that respects
`prefers-reduced-motion`, tabular numerals for data, phone-first touch targets, and iOS
safe-area padding so installed-app screens start below the status bar.
