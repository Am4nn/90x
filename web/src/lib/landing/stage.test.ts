import { afterEach, describe, expect, it, vi } from "vitest";
import { onStage, publishRen, publishWordmark, stage } from "./stage";

afterEach(() => {
  publishRen(null);
  publishWordmark(null);
});

describe("stage", () => {
  it("keeps what Ren and the wordmark publish, and clears it when they publish null", () => {
    const ren = { grid: { cols: 1, rows: 1, cw: 1, ch: 1, radius: 1 }, width: 10, height: 10 };
    publishRen(ren);
    expect(stage.ren).toBe(ren);
    publishRen(null);
    expect(stage.ren).toBeNull();
    const mark = { step: 11, dots: [], fontSize: 100 };
    publishWordmark(mark);
    expect(stage.mark).toBe(mark);
  });

  it("tells every listener when either changes, until it unsubscribes", () => {
    const a = vi.fn();
    const b = vi.fn();
    const offA = onStage(a);
    onStage(b)();
    publishRen(null);
    publishWordmark(null);
    expect(a).toHaveBeenCalledTimes(2);
    expect(b).not.toHaveBeenCalled();
    offA();
    publishRen(null);
    expect(a).toHaveBeenCalledTimes(2);
  });

  it("publishes before it notifies, so a listener reads the new geometry", () => {
    const seen: unknown[] = [];
    const off = onStage(() => seen.push(stage.mark?.fontSize));
    publishWordmark({ step: 7, dots: [], fontSize: 123 });
    off();
    expect(seen).toEqual([123]);
  });
});
