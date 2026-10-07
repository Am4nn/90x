import { describe, expect, it } from "vitest";
import sitemap from "./sitemap";

describe("sitemap", () => {
  it("lists the front door, the try page and the two legal pages, and nothing else", () => {
    expect(sitemap().map((entry) => new URL(entry.url).pathname)).toEqual(["/", "/try", "/privacy", "/terms"]);
  });
});
