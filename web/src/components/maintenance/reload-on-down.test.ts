import { afterEach, describe, expect, it, vi } from "vitest";

// The effect is run by hand: React would run it on mount in the browser.
let effect: (() => (() => void) | void) | undefined;
vi.mock("react", () => ({ useEffect: (fn: () => (() => void) | void) => void (effect = fn) }));

const { ReloadOnDown } = await import("./reload-on-down");

function mount(answer: Response) {
  const reload = vi.fn();
  const original = vi.fn(async () => answer);
  vi.stubGlobal("window", { fetch: original, location: { reload } });
  ReloadOnDown();
  const cleanup = effect!();
  return { reload, original, cleanup, fetch: () => (globalThis.window as unknown as { fetch: typeof fetch }).fetch("/today") };
}

afterEach(() => {
  vi.unstubAllGlobals();
  effect = undefined;
});

describe("ReloadOnDown", () => {
  it("reloads once on the proxy's maintenance answer, and still hands the response back", async () => {
    const answer = new Response("{}", { status: 503, headers: { "x-90x-maintenance": "1" } });
    const { reload, fetch } = mount(answer);
    expect(await fetch()).toBe(answer);
    await fetch();
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("leaves any other answer alone, a plain 503 included", async () => {
    for (const answer of [new Response("x", { status: 503 }), new Response("x", { status: 200 })]) {
      const { reload, fetch } = mount(answer);
      await fetch();
      expect(reload).not.toHaveBeenCalled();
    }
  });

  it("puts the original fetch back on unmount", () => {
    const { original, cleanup } = mount(new Response("x"));
    (cleanup as () => void)();
    expect((globalThis.window as unknown as { fetch: unknown }).fetch).toBe(original);
  });
});
