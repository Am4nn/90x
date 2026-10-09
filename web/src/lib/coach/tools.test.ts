import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ noted: true, calls: [] as unknown[][] }));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/log", () => ({ logError: () => {} }));
vi.mock("./gaps", () => ({
  noteLibraryGap: async (...args: unknown[]) => {
    h.calls.push(args);
    return { noted: h.noted };
  },
}));
// The rest of the toolset reaches the database when called, not when built.
vi.mock("@/db", () => ({ db: {} }));
vi.mock("./tools-data", () => ({}));
vi.mock("./memory", () => ({ listMemory: async () => [] }));
vi.mock("./mocks", () => ({ designTopics: async () => [] }));

const { coachTools } = await import("./tools");

beforeEach(() => {
  h.noted = true;
  h.calls = [];
});

describe("coachTools", () => {
  it("has no way to write a lesson, and can note a Library gap", () => {
    const names = Object.keys(coachTools("u1"));
    expect(names).not.toContain("write_lesson");
    expect(names).toContain("note_library_gap");
  });

  it("note_library_gap passes the topic and tells Coach to say it was passed on", async () => {
    const tool = coachTools("u1").note_library_gap as unknown as { execute: (i: { topic: string }) => Promise<Record<string, unknown>> };
    const out = await tool.execute({ topic: "convex hull" });
    expect(h.calls).toEqual([["u1", "convex hull"]]);
    expect(out).toMatchObject({ noted: true });
    expect(String(out.note)).toContain("passed it on");
  });

  it("note_library_gap says so when the topic could not be noted", async () => {
    h.noted = false;
    const tool = coachTools("u1").note_library_gap as unknown as { execute: (i: { topic: string }) => Promise<Record<string, unknown>> };
    expect(await tool.execute({ topic: "what?!" })).toMatchObject({ noted: false });
  });
});
