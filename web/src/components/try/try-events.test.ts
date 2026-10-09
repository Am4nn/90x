import { afterEach, beforeEach, describe, expect, it, type Mock, vi } from "vitest";
import { newVisit, resetVisit, track, trackOnce, visitKinds, watchLeave } from "./try-events";

describe("newVisit", () => {
  it("is 24 lowercase letters and digits, fresh each time", () => {
    const a = newVisit();
    expect(a).toMatch(/^[a-z0-9]{24}$/);
    expect(newVisit()).not.toBe(a);
  });
});

describe("the beacon", () => {
  let sendBeacon: Mock<(url: string, blob: Blob) => boolean>;
  let listeners: Map<string, () => void>;
  const doc = { visibilityState: "visible" as DocumentVisibilityState, addEventListener: vi.fn(), removeEventListener: vi.fn() };

  beforeEach(() => {
    resetVisit();
    sendBeacon = vi.fn<(url: string, blob: Blob) => boolean>(() => true);
    listeners = new Map();
    doc.visibilityState = "visible";
    doc.addEventListener.mockImplementation((type: string, fn: () => void) => listeners.set(type, fn));
    doc.removeEventListener.mockImplementation((type: string) => listeners.delete(type));
    vi.stubGlobal("navigator", { sendBeacon });
    vi.stubGlobal("document", doc);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  const sent = async () => Promise.all(sendBeacon.mock.calls.map(async ([url, blob]) => ({ url, body: JSON.parse(await blob.text()) })));

  it("posts the visit, kind and data to the event route", async () => {
    track("answer", { card: "sd", option: 2, correct: true });
    track("view");
    const [answer, view] = await sent();
    if (!answer || !view) throw new Error("expected two beacons");
    expect(answer.url).toBe("/api/try/event");
    expect(answer.body).toMatchObject({ kind: "answer", data: { card: "sd", option: 2, correct: true } });
    expect(answer.body.visit).toMatch(/^[a-z0-9]{24}$/);
    expect(view.body.visit).toBe(answer.body.visit);
    expect(view.body.kind).toBe("view");
  });

  it("falls back to a keepalive fetch when the browser has no beacon, and never throws", () => {
    const fetchMock = vi.fn(() => Promise.reject(new Error("offline")));
    vi.stubGlobal("navigator", {});
    vi.stubGlobal("fetch", fetchMock);
    expect(() => track("view")).not.toThrow();
    expect(fetchMock).toHaveBeenCalledWith("/api/try/event", expect.objectContaining({ method: "POST", keepalive: true }));
  });

  it("sends one leave, with the time bucketed and the step, however often the tab hides", async () => {
    vi.useFakeTimers({ now: 1_000_000 });
    watchLeave(() => "answered");
    vi.setSystemTime(1_000_000 + 45_000);
    doc.visibilityState = "hidden";
    listeners.get("visibilitychange")?.();
    listeners.get("visibilitychange")?.();
    doc.visibilityState = "visible";
    listeners.get("visibilitychange")?.();
    doc.visibilityState = "hidden";
    listeners.get("visibilitychange")?.();
    const events = await sent();
    expect(events).toHaveLength(1);
    expect(events[0]?.body).toMatchObject({ kind: "leave", data: { seconds: "30-60", step: "answered" } });
  });

  it("sends nothing while the tab stays visible", () => {
    watchLeave(() => "viewed");
    listeners.get("visibilitychange")?.();
    expect(sendBeacon).not.toHaveBeenCalled();
  });

  it("stopping the watcher (in-app navigation) sends the leave, once, even after a hide", async () => {
    vi.useFakeTimers({ now: 1_000_000 });
    const stop = watchLeave(() => "answered");
    vi.setSystemTime(1_000_000 + 5_000);
    stop();
    vi.runAllTimers();
    let events = await sent();
    expect(events).toHaveLength(1);
    expect(events[0]?.body).toMatchObject({ kind: "leave", data: { seconds: "0-10", step: "answered" } });
    const again = watchLeave(() => "answered");
    doc.visibilityState = "hidden";
    listeners.get("visibilitychange")?.();
    again();
    vi.runAllTimers();
    events = await sent();
    expect(events).toHaveLength(1);
  });

  it("a stop followed at once by a new watcher (React's dev remount) is not a leave", () => {
    vi.useFakeTimers();
    watchLeave(() => "viewed")();
    watchLeave(() => "viewed");
    vi.runAllTimers();
    expect(sendBeacon).not.toHaveBeenCalled();
  });

  it("a hide after a stop-then-hide sends nothing more, and a hide then a stop sends one", async () => {
    vi.useFakeTimers();
    const stop = watchLeave(() => "viewed");
    doc.visibilityState = "hidden";
    listeners.get("visibilitychange")?.();
    stop();
    vi.runAllTimers();
    expect(await sent()).toHaveLength(1);
  });

  it("trackOnce sends a kind once per visit, across remounts, and remembers every kind sent", () => {
    trackOnce("view");
    trackOnce("view");
    track("answer", { card: "sd" });
    trackOnce("view");
    expect(sendBeacon).toHaveBeenCalledTimes(2);
    expect(visitKinds()).toEqual(["view", "answer"]);
  });
});
