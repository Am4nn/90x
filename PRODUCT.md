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
90x picks today's missions from your weakest areas, grades what you type against a card's key
points, schedules reviews with FSRS, and tracks a readiness score per area. Success means
consistent daily practice that moves a measured readiness number — not time spent in the app.

## Positioning

A campaign, not a library. Neighbouring products give you a problem list or a flashcard deck;
90x decides each day's work from a weekday template and your weakest patterns, grades free-text
answers against source-grounded key points, and raises readiness only when missions are
completed. The coach answers by searching the library and citing what it used, and every change
it proposes needs a tap first.

## Operating Context

- Mobile-first PWA (installable), dark only, used in short daily sessions; desktop is the
  second surface.
- Daily loop: **Today** → do missions (new problems, due reviews, a design topic, cards, a mock
  or a STAR story) → check in. **Feed** for spaced-repetition cards; **Library** for study and
  the Pattern Map; **Coach** for chat, solution review, pattern lessons, mocks, stories, and a
  Sunday weekly review.
- **Friends** compares progress (readiness, streak, solved this week, last mock) and shares
  check-in activity without notes.
- Lesson and card text draws on 42 public sources, credited in the app and in NOTICE.
- LeetCode sync is optional; manual check-ins always work. Sign-in is Google, and new accounts
  wait for admin approval.

## Capabilities and Constraints

- **Shipped:** Today + 90 Grid, readiness per area, Feed (AI grading, FSRS, flags,
  declarations), Library (3,693 problems, 5,290 notes, 191 pattern tricks, Pattern Map,
  roadmaps), check-ins, LeetCode sync, Coach (tool-using chat, memory, solution review, pattern
  lessons, text mocks, STAR story bank, weekly review), Friends, web push, offline Today/Feed,
  admin approval + card review.
- **Constraints:** dark theme only; invite-only with admin approval; AI budget $10/month that
  degrades to a cheaper model but never blocks grading; server code bypasses RLS so every query
  is scoped to the viewer; content must be source-grounded.
- **Accessibility:** WCAG 2.1 AA scan runs in CI (axe-core + Playwright); reduced-motion
  respected; tabular numerals for data.

## Brand Commitments

- Name: **90x**. The mark is "90" plus an x stroke.
- Voice: precise, calm, direct. It is a coach, not a hype machine — no gamification beyond the
  90 Grid, no exclamation.
- Cool signal-cyan accent on near-black; Sora for titles and numbers, Manrope for everything
  else.

## Evidence on Hand

  signatures).
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
`prefers-reduced-motion`, phone-first touch targets.
