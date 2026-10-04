import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Every admin page and every admin server action must open with the admin check.
// A page that forgets it renders to any signed-in user, and the route list in the
// break-in sweep only catches the routes somebody remembered to add. Reading the
// files makes the check hold for the next page as well.

const ROOT = join(process.cwd(), "src/app/admin");

function files(dir: string, name: RegExp): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const path = join(dir, e.name);
    if (e.isDirectory()) return files(path, name);
    return name.test(e.name) ? [path] : [];
  });
}

describe("admin guard", () => {
  const pages = files(ROOT, /^page\.tsx$/);
  const actions = files(ROOT, /^actions\.tsx?$/);

  it("finds the admin surface", () => {
    expect(pages.length).toBeGreaterThan(5);
    expect(actions.length).toBeGreaterThan(1);
  });

  it.each(pages)("%s calls requireAdmin()", (path) => {
    expect(readFileSync(path, "utf8")).toMatch(/await requireAdmin\(\)/);
  });

  it.each(actions)("%s checks adminViewer() in every exported action", (path) => {
    const source = readFileSync(path, "utf8");
    const exported = source.match(/export async function \w+/g) ?? [];
    const guarded = source.match(/await adminViewer\(\)/g) ?? [];
    expect(guarded.length).toBeGreaterThanOrEqual(exported.length);
  });
});
