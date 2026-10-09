import { expect, type Locator, type Page, test } from "@playwright/test";

// The browser-side twin of src/components/landing/guard.test.ts: the copy rules and the consent line as a
// visitor gets them, after the page has rendered, at both layouts. The source guard cannot see a phrase
// split across elements, a title, a meta tag or an alt text; this reads them all.

const WIDE = { width: 1280, height: 800 } as const;
const PHONE = { width: 390, height: 844 } as const;
const LAYOUTS = [
  ["1280x800", WIDE],
  ["390x844", PHONE],
] as const;

const FORBIDDEN: readonly [string, RegExp][] = [
  ["grades what you type", /grad(?:es?|ed|ing) what you type/i],
  ["20 minutes a day, or any fixed daily time", /20 minutes|\d+ ?min(?:ute)?s? a day/i],
  ["a short or quick session", /(?:short|quick) session/i],
  ["Eleven kinds", /eleven kinds/i],
];

/** Everything a visitor, a crawler or a link preview reads, each with where it came from, whitespace folded to single spaces. */
function readEverything(page: Page) {
  return page.evaluate(() => {
    // The browser runs this function on its own, so the helper has to live inside it.
    // oxlint-disable-next-line unicorn/consistent-function-scoping
    const fold = (text: string | null | undefined) => (text ?? "").replace(/\s+/g, " ").trim();
    const texts: [string, string][] = [
      // innerText is what is laid out; textContent also covers the layout that is display: none.
      ["body innerText", fold(document.body.innerText)],
      ["body textContent", fold(document.body.textContent)],
      ["title", fold(document.title)],
    ];
    for (const meta of document.querySelectorAll<HTMLMetaElement>(
      'meta[name="description"], meta[property^="og:"], meta[name^="twitter:"]',
    ))
      texts.push([`meta ${meta.getAttribute("name") ?? meta.getAttribute("property")}`, fold(meta.content)]);
    for (const el of document.querySelectorAll("img[alt]")) texts.push(["img alt", fold(el.getAttribute("alt"))]);
    for (const el of document.querySelectorAll("[aria-label]")) texts.push(["aria-label", fold(el.getAttribute("aria-label"))]);
    for (const el of document.querySelectorAll('script[type="application/ld+json"]')) texts.push(["JSON-LD", fold(el.textContent)]);
    const shouting = [...document.querySelectorAll("h1, h2, h3, button, a")]
      .map((el) => fold(el.textContent))
      .filter((text) => text.includes("!"));
    return { texts, shouting };
  });
}

async function expectCopyClean(page: Page, where: string) {
  const { texts, shouting } = await readEverything(page);
  const hits = FORBIDDEN.flatMap(([name, pattern]) =>
    texts.filter(([, text]) => pattern.test(text)).map(([from]) => `"${name}" in ${from}`),
  );
  expect(hits, `${where}: forbidden copy`).toEqual([]);
  expect(shouting, `${where}: an exclamation mark in a heading, button or link`).toEqual([]);
}

for (const [label, viewport] of LAYOUTS) {
  test.describe(`rendered copy, ${label}`, () => {
    test.use({ viewport, reducedMotion: "reduce" });

    test("the landing page says none of the forbidden things, anywhere it can be read", async ({ page }) => {
      await page.goto("/");
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      await expectCopyClean(page, `/ at ${label}`);
    });

    test("/try says none of them, before and after an answer", async ({ page }) => {
      await page.goto("/try");
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      await expectCopyClean(page, `/try at ${label}`);
      await page
        .getByRole("button", {
          name: /Update the database, then delete the cache key/,
        })
        .click();
      await expect(page.locator("#try-verdict")).toContainText("Correct");
      await expectCopyClean(page, `/try answered at ${label}`);
    });
  });
}

/** Every Google button on the page that a person can see (`data-cta`), the nav's smaller "Sign in" included. */
const visibleButtons = async (page: Page) => {
  const all = await page.locator("[data-cta]").all();
  const visible: Locator[] = [];
  for (const button of all) if (await button.isVisible()) visible.push(button);
  return visible;
};

/** The consent line that belongs to this button: in the nearest ancestor that holds one, which must be a block of its own and not the whole section. */
async function expectOwnConsent(button: Locator, where: string) {
  const group = button.locator("xpath=ancestor::*[.//*[@data-landing='consent']][1]");
  await expect(group, `${where}: no consent line anywhere above the button`).toHaveCount(1);
  const tag = await group.evaluate((el) => el.tagName);
  expect(
    ["SECTION", "MAIN", "BODY", "HTML"],
    `${where}: the consent line is only found at the ${tag} level, not beside the button`,
  ).not.toContain(tag);
  const consent = group.locator('[data-landing="consent"]');
  await expect(consent, `${where}: one consent line in the button's group`).toHaveCount(1);
  await expect(consent, where).toBeVisible();
  await expect(consent, where).toHaveText("By continuing you agree to the Terms and Privacy Policy.");
  await expect(consent.getByRole("link", { name: "Terms", exact: true }), where).toHaveAttribute("href", "/terms");
  await expect(consent.getByRole("link", { name: "Privacy Policy", exact: true }), where).toHaveAttribute("href", "/privacy");
  await expect(consent.getByRole("link", { name: "Terms", exact: true }), where).toBeVisible();
  await expect(consent.getByRole("link", { name: "Privacy Policy", exact: true }), where).toBeVisible();
}

const spotsOf = (buttons: Locator[]) => Promise.all(buttons.map((b) => b.getAttribute("data-cta")));

// Ruling: the per-button consent rule covers every "Continue with Google" CTA (the hero's, the close's, /try's pinned bar).
// The small nav "Sign in" (data-cta="nav", the long landing's nav and /try's top bar) is for returning users and is
// exempt: it has no consent line beside it, as in production today and in the approved mocks. Nothing else is exempt,
// and the tests below count the buttons, so a new Google button without its consent line fails here.
const EXEMPT_SPOT = "nav";

for (const [label, viewport] of LAYOUTS) {
  test.describe(`every visible Google button has its own consent line, ${label}`, () => {
    test.use({ viewport, reducedMotion: "reduce" });
    // The nav's "Sign in" is shown by the long layout only.
    const wide = viewport.width >= 760;

    test("/: exactly the hero's and the close's, each with its own consent line (and the nav's on the long layout)", async ({ page }) => {
      await page.goto("/");
      await expect(page.locator("[data-pending]")).toHaveCount(0);
      const buttons = await visibleButtons(page);
      const spots = await spotsOf(buttons);
      expect(spots.toSorted(), "the Google buttons laid out on /").toEqual(wide ? ["close", "hero", "nav"] : ["close", "hero"]);
      for (const [index, button] of buttons.entries()) {
        if (spots[index] !== EXEMPT_SPOT) await expectOwnConsent(button, `/ ${spots[index]} at ${label}`);
      }
    });

    test("/try: after an answer the bar's button has its own consent line", async ({ page }) => {
      await page.goto("/try");
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      expect(await spotsOf(await visibleButtons(page)), "before an answer the page's one Google button is the top bar's").toEqual(["nav"]);
      await page
        .getByRole("button", {
          name: /Update the database, then delete the cache key/,
        })
        .click();
      // The pinned bar on a phone; the sign-in card under the lesson on a wide screen (md and up).
      await expect(page.locator(viewport.width >= 768 ? '[data-try="signin"]' : '[data-try="bar"]')).toBeVisible();
      const buttons = await visibleButtons(page);
      const spots = await spotsOf(buttons);
      expect(spots.toSorted(), "after an answer: the top bar's and the bar's").toEqual(["nav", "try"]);
      await expectOwnConsent(buttons[spots.indexOf("try")] as Locator, `/try at ${label}`);
    });
  });
}
