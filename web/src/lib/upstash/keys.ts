// Redis and QStash are shared with Curfew: every key and schedule
// 90x creates is namespaced, and 90x never runs FLUSH/KEYS/unscoped SCAN.
const KEY_PREFIX = "90x:";
export const SCHEDULE_PREFIX = "90x-";

export const key = (...parts: string[]) => `${KEY_PREFIX}${parts.join(":")}`;
export const scheduleId = (name: string) => `${SCHEDULE_PREFIX}${name}`;
