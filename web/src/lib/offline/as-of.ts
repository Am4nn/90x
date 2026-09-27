// "as of" for a saved copy of a page, in the browser's time zone: the time for
// today's copy, with the day added for an older one.
const TIME = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
const DAY = new Intl.DateTimeFormat("en-US", { day: "numeric", month: "short" });

export function asOfText(savedAt: Date, now: Date): string {
  const time = TIME.format(savedAt);
  return savedAt.toDateString() === now.toDateString() ? time : `${DAY.format(savedAt)}, ${time}`;
}
