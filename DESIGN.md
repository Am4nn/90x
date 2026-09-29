---
name: 90x
description: Interview prep that plans your day and checks your answers.
colors:
  signal-cyan: "#67E8F9"
  cyan-wash: "#0E1E24"
  on-cyan: "#06222A"
  console-black: "#0A0C10"
  surface: "#0F1218"
  surface-raised: "#141820"
  hairline: "#1C2029"
  hairline-strong: "#262B36"
  text: "#E6E9EF"
  text-secondary: "#AEB5C2"
  text-muted: "#7D8594"
  topic-dsa: "#818CF8"
  topic-design: "#C084FC"
  topic-cs: "#2DD4BF"
  topic-java: "#FB923C"
  topic-sql: "#F472B6"
  status-ready: "#4ADE80"
  status-getting-there: "#FACC15"
  status-not-yet: "#F87171"
  avatar-a: "#262A45"
  avatar-b: "#322946"
typography:
  display:
    fontFamily: "Sora, ui-sans-serif, system-ui, sans-serif"
    fontSize: "32px"
    fontWeight: 700
    lineHeight: 1.1
    letterSpacing: "-0.02em"
  dial:
    fontFamily: "Sora, ui-sans-serif, system-ui, sans-serif"
    fontSize: "44px"
    fontWeight: 700
    lineHeight: 1
  title:
    fontFamily: "Sora, ui-sans-serif, system-ui, sans-serif"
    fontSize: "22px"
    fontWeight: 600
    lineHeight: 1.25
    letterSpacing: "-0.015em"
  heading:
    fontFamily: "Sora, ui-sans-serif, system-ui, sans-serif"
    fontSize: "16px"
    fontWeight: 600
    lineHeight: 1.4
  body:
    fontFamily: "Manrope, ui-sans-serif, system-ui, sans-serif"
    fontSize: "15px"
    fontWeight: 500
    lineHeight: 1.55
  small:
    fontFamily: "Manrope, ui-sans-serif, system-ui, sans-serif"
    fontSize: "13px"
    fontWeight: 500
    lineHeight: 1.45
  tag:
    fontFamily: "Manrope, ui-sans-serif, system-ui, sans-serif"
    fontSize: "12px"
    fontWeight: 700
    lineHeight: 1
rounded:
  cell: "3px"
  sm: "8px"
  md: "10px"
  lg: "12px"
  xl: "14px"
  "2xl": "18px"
  pill: "999px"
spacing:
  "1": "4px"
  "2": "8px"
  "3": "12px"
  "4": "16px"
  "5": "20px"
  "6": "24px"
  "8": "32px"
components:
  button-primary:
    backgroundColor: "{colors.signal-cyan}"
    textColor: "{colors.on-cyan}"
    rounded: "{rounded.lg}"
    padding: "0 20px"
    height: "44px"
  button-secondary:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
    rounded: "{rounded.lg}"
    padding: "0 20px"
    height: "44px"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.text-secondary}"
    rounded: "{rounded.lg}"
    padding: "0 20px"
    height: "44px"
  chip:
    backgroundColor: "transparent"
    textColor: "{colors.text-secondary}"
    rounded: "{rounded.pill}"
    padding: "0 14px"
    height: "36px"
  chip-selected:
    backgroundColor: "{colors.cyan-wash}"
    textColor: "{colors.signal-cyan}"
    rounded: "{rounded.pill}"
    padding: "0 14px"
    height: "36px"
  card:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
    rounded: "{rounded.xl}"
    padding: "20px"
  input:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
    rounded: "{rounded.lg}"
    padding: "0 14px"
    height: "40px"
---

# Design System: 90x

## Overview

**Creative North Star: "The Prep Console"**

90x looks like an instrument panel for a single job: getting ready. It is a dark console read at
a glance between problems, built from hairline rules, quiet surfaces and one signal colour that
means "this is an action or where you are". Data is set in tabular numerals and read like
telemetry — a readiness number, a streak, a day grid. Nothing decorates; every mark either
carries information or gets out of the way.

The console is calm on purpose. Because the product grades you and tells you the truth about
your readiness, the surface must never cheerlead or scold. Meaning is carried by position, weight
and a small, disciplined colour vocabulary, not by motion or ornament. Depth is a hairline and a
slightly raised surface, not a shadow. When the app does move — a square stamping in, the
coach's working dots — it is one authored moment, not scattered effects.

**Key Characteristics:**

- Near-black console ground, dark-only; light is never a category default here.
- One signal accent (cyan) for actions and "you are here"; topic and status colours are earned
  by meaning and never swapped.
- Two faces: Sora for titles and numbers, Manrope for everything else. Six text sizes, no more.
- Borders, not shadows. Flat at rest; depth appears only on floating layers.
- Generous section rhythm, tight groups, dense but legible telemetry.

## Colors

A near-black neutral field with a single saturated voice reserved for action, plus two small,
disciplined vocabularies — topic and status — that are only spent when they carry meaning.

### Primary

- **Signal Cyan** (#67E8F9): the one accent. Primary buttons, the active tab, the current
  selection, focus rings, "you are here". Paired with **Cyan Wash** (#0E1E24) as its background
  tint and **On Cyan** (#06222A) as the text that sits on it.

### Secondary

Topic colours say *what something is about*. They tint category tags, area bars and the Pattern
Map, and never act as buttons.

- **DSA Indigo** (#818CF8)
- **Design Violet** (#C084FC)
- **CS Teal** (#2DD4BF)
- **Java Orange** (#FB923C)
- **SQL Rose** (#F472B6)

### Tertiary

Status colours say *how well you're doing*. They colour readiness bands and score numbers only.

- **Ready Green** (#4ADE80): readiness band, positive change.
- **Getting-there Amber** (#FACC15): mid band, caution.
- **Not-yet Red** (#F87171): low band, failure, destructive.

### Neutral

- **Console Black** (#0A0C10): the page ground.
- **Surface** (#0F1218) and **Surface Raised** (#141820): cards, list bodies, selected rows.
- **Hairline** (#1C2029) and **Hairline Strong** (#262B36): card borders and control strokes.
- **Text** (#E6E9EF), **Text Secondary** (#AEB5C2), **Text Muted** (#7D8594): primary copy,
  secondary copy, and labels/placeholders.
- **Avatar Indigo** (#262A45) and **Avatar Violet** (#322946): the 20% washes behind a person's
  initial, so each person keeps a consistent identity tint on the Friends page.

### Named Rules

**The One Voice Rule.** Signal Cyan is the only saturated colour allowed to mean "action". It
covers well under 10% of any screen; its rarity is what makes it read as a signal.

**The Earned Colour Rule.** A coloured pixel must be justified by category (topic) or by result
(status). Decorative colour does not exist. Roles never swap: accent is not used as a topic, a
topic is never used as a button.

## Typography

**Display Font:** Sora (with ui-sans-serif, system-ui, sans-serif)
**Body Font:** Manrope (with ui-sans-serif, system-ui, sans-serif)

**Character:** A geometric display face for titles and every number, over a humanist text face
for reading. The pairing reads as instrument labelling next to a manual: precise headers,
comfortable prose.

### Hierarchy

- **Display** (Sora 700, 32px, 1.1, -0.02em): page-defining numbers and the largest statement on
  a screen; the readiness dial uses the 44px **dial** step.
- **Title** (Sora 600, 22px, 1.25, -0.015em): the page `<h1>`, one per screen.
- **Heading** (Sora 600, 16px, 1.4): section headings inside a page.
- **Body** (Manrope 500, 15px, 1.55): all prose and controls; keep measure to 65–75ch.
- **Small** (Manrope 500, 13px, 1.45): secondary copy, captions, metadata, list hints; muted.
- **Tag** (Manrope 700, 12px, 1, tracked): tiny labels and pills.

**Numbers are tabular.** Any figure that changes — scores, streaks, counts, timers — sets
`font-variant-numeric: tabular-nums` so it does not jitter.

### Named Rules

**The Six-Sizes Rule.** There are six text sizes and one dial size. If a new size seems needed,
the hierarchy is wrong, not the scale.

**The Numbers-Are-Sora Rule.** Every numeral that represents a measurement is Sora, tabular,
and set at a size that matches its importance.

## Layout

Mobile-first. Phone: a single column with a fixed bottom tab bar and a page header of title plus
at most one icon action; content scrolls under the bar with a safe-area pad. Desktop (≥768px):
a 220px left sidebar and content in two or three columns inside a centered max-width container.

Spacing rhythm: 24px between sections, 16–20px inside cards, ~14px vertical padding on list rows.
Space above a heading is larger than the space below it. Grid-like data (the 90 Grid, the
scoreboard) packs tighter than prose and never stretches to fill.

## Elevation & Depth

**Flat by default.** Depth is a hairline border plus a one-step surface lightening, not a
shadow: `Console Black` → `Surface` → `Surface Raised`. Cards are bordered, never shadowed.
Shadows exist only on things that genuinely float above the page — bottom sheets, popovers and
menus — and there they are soft and offset, never a coloured zero-offset halo.

**The Border-Not-Shadow Rule.** A card edge is a 1px hairline. If an element needs to feel above
the page, raise its surface tone first; reach for a shadow only for true floating layers.

## Shapes

Soft, restrained rectangles. Cards and panels use a 12–14px radius (`lg` / `xl`); inputs and
buttons 10–12px; small controls and tags are full pills (999px). The 90 Grid's cells are the one
hard-edged element (3px) because they render as a data grid. Borders are always 1px hairlines;
there are no thick or coloured side-borders. No clipping, no geometric masks.

## Components

### Buttons

- **Shape:** 12px radius (`lg`), 36/40/44px tall for small/md/lg, fixed height with horizontal
  padding.
- **Primary:** Signal Cyan ground, On Cyan text. One per view for the main action.
- **Secondary:** bordered `Surface` with `Hairline Strong` stroke; the default quiet action.
- **Ghost:** no ground or stroke; text secondary that lightens to text on hover. For tertiary
  actions and row-level controls.
- **Hover / Focus:** hover lightens the cyan / deepens the border; focus-visible draws a 2px
  Signal Cyan outline at 2px offset. Transitions are colour-only and short.

### Chips

- **Style:** pill outline (`Hairline Strong`) with secondary text; no fill at rest.
- **State:** selected swaps to Cyan Wash ground, Signal Cyan text and cyan border. Used for
  time/topic/day pickers and multi-select.

### Cards / Containers

- **Corner Style:** 14px (`xl`).
- **Background:** `Surface` on the `Console Black` ground.
- **Border:** 1px `Hairline`; list rows divide with a top hairline, never a full grid.
- **Padding:** 16–20px; list rows ~14px vertical.

### Inputs / Fields

- **Style:** 12px radius, `Surface` or `Console Black` ground, 1px `Hairline Strong` stroke,
  40px tall. Textarea grows with a min height.
- **Focus:** border shifts to Signal Cyan (no glow). Placeholder is `Text Muted`, never a
  substitute for a label.

### Navigation

- **Mobile:** bottom tab bar, icon + label stacked, active tab on a Cyan Wash pill; now six
  destinations (Today, Feed, Library, Coach, Friends, Me).
- **Desktop:** 220px sticky sidebar, 20px icons, active row on a `Surface Raised` fill with
  cyan icon and text. Same six destinations; admin link pinned to the footer.

### Signature Components

- **Coach mark:** **Ren** — the character shared with our sibling app Curfew, taken from its
  tab-bar icon: a shaded sphere with two eyes, lit red (#FF5C7F → #B3153A) over white. It stands
  wherever the Coach speaks, in place of a generic initial. The Coach **nav tab keeps the app's own
  chat-bubble icon**, so the nav stays one consistent icon set. Ren's red is the one intentional
  colour outside the topic/status roles, because it marks an identity rather than a state.
- **Readiness Dial:** a 128px ring stroked in the band's status colour, the number set at the
  `dial` size (Sora, tabular), "Readiness" tag beneath. Zero renders as "—", never a stray dot.
- **90 Grid:** one square per campaign day; done/revived squares carry a cyan X that stamps in
  with a 420ms spring; today carries a cyan outline; missed is a faint hairline box.
- **Pattern Map:** pattern nodes lit by mastery, edges as links; the weakest pattern pulses
  (respecting reduced motion).
- **Trend line:** a 14-day readiness sparkline stroked in Signal Cyan with a signed delta label.

## Do's and Don'ts

### Do:

- **Do** keep Signal Cyan rare and meaningful — actions and "you are here" only.
- **Do** justify every coloured pixel by topic or status; keep everything else neutral.
- **Do** set all measurements in Sora with tabular numerals.
- **Do** raise surface tone for depth and reserve shadows for floating layers.
- **Do** keep one `<h1>` per page and one primary action per view.
- **Do** recede secondary copy to `Text Muted` and load-bearing copy to `Text`.
- **Do** let the phone be the first-class surface: bottom tab bar, safe-area padding, 44px
  touch targets.

### Don't:

- **Don't** use gradients, glass, or glow; emphasis comes from weight, size and the single
  accent.
- **Don't** add a second saturated accent or use topic/status colours as buttons.
- **Don't** put shadows on cards or use coloured side-borders.
- **Don't** introduce new text sizes, new fonts, or a light theme.
- **Don't** decorate empty space with icon tiles, sparklines-as-filler, or unicode glyphs
  standing in for an icon set.
- **Don't** use the accent for large fills; it is a signal, not a field.
