import { beforeEach, describe, expect, it, vi } from "vitest";

const invite = vi.fn<(inviterId: string, email: string) => Promise<"sent">>(async () => "sent");
// An atomic per-day counter, like takeDailyCount's INCR: `down` makes it fail closed.
const counter = { used: 0, down: false };
const takeDailyCount = vi.fn<(userId: string, kind: string) => Promise<boolean>>(async () => {
  if (counter.down) return false;
  counter.used += 1;
  return counter.used <= 10;
});

vi.mock("@/lib/auth/viewer", () => ({ requireViewer: async () => ({ id: "u1" }) }));
vi.mock("@/lib/friends/service", () => ({
  invite,
  accept: vi.fn(),
  dismiss: vi.fn(),
  refuse: vi.fn(),
  revoke: vi.fn(),
  unfriend: vi.fn(),
}));
vi.mock("@/lib/upstash/rate-limit", () => ({ takeDailyCount }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const { sendInviteAction } = await import("./friends-actions");

const form = (email: string) => {
  const f = new FormData();
  f.set("email", email);
  return f;
};

describe("sendInviteAction", () => {
  beforeEach(() => {
    invite.mockClear();
    takeDailyCount.mockClear();
    counter.used = 0;
    counter.down = false;
  });

  it("counts the invite against the sender's day before sending", async () => {
    const state = await sendInviteAction({}, form("friend@example.test"));
    expect(takeDailyCount).toHaveBeenCalledWith("u1", "invite");
    expect(invite).toHaveBeenCalledWith("u1", "friend@example.test");
    expect(state.ok).toBe(true);
  });

  it("lets only the day's ten through when many invites arrive at once", async () => {
    const states = await Promise.all(Array.from({ length: 25 }, (_, i) => sendInviteAction({}, form(`p${i}@example.test`))));
    expect(invite).toHaveBeenCalledTimes(10);
    expect(states.filter((s) => s.ok)).toHaveLength(10);
    expect(states.filter((s) => s.error?.includes("invites a day"))).toHaveLength(15);
  });

  it("sends nothing when the counter is unreachable (fails closed)", async () => {
    counter.down = true;
    const state = await sendInviteAction({}, form("friend@example.test"));
    expect(invite).not.toHaveBeenCalled();
    expect(state.error).toBeTruthy();
  });
});
