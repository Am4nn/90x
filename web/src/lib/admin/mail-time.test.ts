import { describe, expect, it } from "vitest";
import { formatUtc, instant, isUnread, newestFirst, unreadOf } from "./mail-time";

const mail = (createdAt: string) => ({ id: "x", from: "a", to: [], subject: "s", createdAt, attachments: 0 });

describe("isUnread", () => {
  it("compares instants, not strings: Resend +00:00 microseconds vs our Z milliseconds", () => {
    const seen = "2024-02-22T23:41:11.900Z";
    expect(isUnread("2024-02-22T23:41:11.894719+00:00", seen)).toBe(false);
    expect(isUnread("2024-02-22T23:41:11.950000+00:00", seen)).toBe(true);
  });

  it("handles other offsets", () => {
    expect(isUnread("2024-02-23T01:00:00+02:00", "2024-02-22T22:00:00.000Z")).toBe(true);
    expect(isUnread("2024-02-23T01:00:00+02:00", "2024-02-22T23:00:00.000Z")).toBe(false);
  });

  it("is unread with no marker or an unreadable date", () => {
    expect(isUnread("2024-02-22T23:41:11Z", null)).toBe(true);
    expect(isUnread("", "2024-02-22T23:41:11.000Z")).toBe(true);
    expect(isUnread("2024-02-22T23:41:11Z", "garbage")).toBe(true);
  });
});

describe("unreadOf", () => {
  it("counts what arrived after the marker", () => {
    const emails = [mail("2024-02-22T10:00:00Z"), mail("2024-02-22T12:00:00Z"), mail("2024-02-22T14:00:00+00:00")];
    expect(unreadOf(emails, "2024-02-22T11:00:00.000Z")).toBe(2);
    expect(unreadOf(emails, null)).toBe(3);
  });
});

describe("newestFirst", () => {
  it("orders by instant and sinks unreadable dates", () => {
    const sorted = [mail(""), mail("2024-02-22T10:00:00Z"), mail("2024-02-22T09:00:00.5+01:00")].toSorted(newestFirst);
    expect(sorted.map((m) => m.createdAt)).toEqual(["2024-02-22T10:00:00Z", "2024-02-22T09:00:00.5+01:00", ""]);
  });
  it("treats two unreadable dates as equal", () => {
    expect(newestFirst(mail(""), mail("nope"))).toBe(0);
  });
});

describe("formatUtc", () => {
  it("formats a valid date in UTC", () => {
    expect(formatUtc("2024-02-22T23:41:11.894719+00:00")).toBe("2024-02-22 23:41 UTC");
  });
  it("says unknown for empty or invalid values instead of throwing", () => {
    expect(formatUtc("")).toBe("unknown");
    expect(formatUtc("not a date")).toBe("unknown");
    expect(instant("not a date")).toBeNull();
  });
});
