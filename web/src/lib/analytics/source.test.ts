import { describe, expect, it } from "vitest";
import { type Attribution, captureSource, decodeAttribution, encodeAttribution, sourceGroup } from "./source";

const host = "90x.example";
const visit = (url: string, referer: string | null = null, hasCookie = false) =>
  captureSource({ url: new URL(url), referer, host, hasCookie });

describe("captureSource", () => {
  it("keeps the utm parameters, lower-cased", () => {
    expect(visit(`https://${host}/?utm_source=LinkedIn&utm_medium=post&utm_campaign=launch`)).toEqual({
      source: "linkedin",
      medium: "post",
      campaign: "launch",
      referrer: null,
    });
  });

  it("falls back to the referrer host when there is no utm_source", () => {
    expect(visit(`https://${host}/`, "https://www.linkedin.com/feed/")).toMatchObject({
      source: "www.linkedin.com",
      referrer: "www.linkedin.com",
    });
  });

  it("keeps nothing for a direct visit, our own pages or the sign-in round trip", () => {
    expect(visit(`https://${host}/`)).toBeNull();
    expect(visit(`https://${host}/today`, `https://${host}/`)).toBeNull();
    expect(visit(`https://${host}/`, "https://accounts.google.com/")).toBeNull();
    expect(visit(`https://${host}/`, "https://abc.supabase.co/auth/v1/callback")).toBeNull();
  });

  it("never overwrites a first touch", () => {
    expect(visit(`https://${host}/?utm_source=x`, null, true)).toBeNull();
  });

  it("reads the Android app's referrer as LinkedIn", () => {
    const got = visit(`https://${host}/`, "android-app://com.linkedin.android");
    expect(sourceGroup(got?.source, got?.referrer)).toBe("linkedin");
  });
});

describe("cookie value", () => {
  it("round trips and treats junk as no cookie", () => {
    const a: Attribution = { source: "linkedin", medium: null, campaign: "launch", referrer: "lnkd.in" };
    expect(decodeAttribution(encodeAttribution(a))).toEqual(a);
    expect(decodeAttribution("not json")).toBeNull();
    expect(decodeAttribution('{"source":5}')).toBeNull();
    expect(decodeAttribution(undefined)).toBeNull();
  });
});

describe("sourceGroup", () => {
  it("buckets into LinkedIn, other, direct and unknown", () => {
    expect(sourceGroup("linkedin")).toBe("linkedin");
    expect(sourceGroup("lnkd.in", "lnkd.in")).toBe("linkedin");
    expect(sourceGroup("newsletter", "www.linkedin.com")).toBe("linkedin");
    expect(sourceGroup("news.ycombinator.com")).toBe("other");
    expect(sourceGroup("direct")).toBe("direct");
    expect(sourceGroup(null)).toBe("unknown");
  });
});
