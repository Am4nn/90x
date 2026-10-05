import { describe, expect, it } from "vitest";
import { classifyStatus, describeResult, endpointHost, shortDetail, vapidSubject } from "./push-rules";

describe("classifyStatus", () => {
  it.each([
    [201, "ok"],
    [404, "gone"],
    [410, "gone"],
    [403, "auth"],
    [401, "auth"],
    [429, "retry"],
    [503, "retry"],
    [400, "rejected"],
    [413, "rejected"],
    [undefined, "error"],
  ])("%s is %s", (status, kind) => expect(classifyStatus(status)).toBe(kind));
});

describe("vapidSubject", () => {
  it("keeps a real mailto: address and an https URL", () => {
    expect(vapidSubject("mailto:me@example.com", undefined)).toEqual({ subject: "mailto:me@example.com", valid: true });
    expect(vapidSubject(" https://90x.amanarya.com ", undefined)).toEqual({ subject: "https://90x.amanarya.com", valid: true });
  });
  it.each(["mailto:", "", undefined, "admin@90x.app", "http://localhost:3000", "mailto:nobody"])("replaces %j with the app URL", (raw) => {
    expect(vapidSubject(raw, "https://90x.amanarya.com/")).toEqual({ subject: "https://90x.amanarya.com", valid: false });
  });
  it("falls back to a mailto: when the app URL is not https", () => {
    expect(vapidSubject("mailto:", "http://localhost:3000").subject.startsWith("mailto:")).toBe(true);
  });
});

describe("endpointHost", () => {
  it("keeps only the host", () => {
    expect(endpointHost("https://web.push.apple.com/QGsecret/token")).toBe("web.push.apple.com");
    expect(endpointHost("nonsense")).toBe("invalid");
  });
});

describe("describeResult", () => {
  const base = { host: "web.push.apple.com", detail: null };
  it("names Apple and says what happened", () => {
    expect(describeResult({ ...base, status: 201, kind: "ok" })).toMatch(/^Apple accepted/);
    expect(describeResult({ ...base, status: 403, kind: "auth", detail: "BadJwtToken" })).toMatch(
      /403.*keys or contact address.*BadJwtToken/,
    );
    expect(describeResult({ ...base, status: 410, kind: "gone" })).toMatch(/no longer subscribed/);
    expect(describeResult({ ...base, status: null, kind: "error", detail: "ENOTFOUND" })).toMatch(/Couldn't reach Apple/);
  });
});

describe("shortDetail", () => {
  it("collapses whitespace, trims and caps length", () => {
    expect(shortDetail('  {"reason":\n "BadJwtToken"} ')).toBe('{"reason": "BadJwtToken"}');
    expect(shortDetail("x".repeat(500))).toHaveLength(200);
    expect(shortDetail(undefined)).toBeNull();
    expect(shortDetail("   ")).toBeNull();
  });
});
