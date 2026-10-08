import { PgDialect } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";
import { cardProblemListed, cardProblemListedJoined, countedFor, listedProblem } from "./listed";

const render = (expr: Parameters<PgDialect["sqlToQuery"]>[0]) => new PgDialect().sqlToQuery(expr);

describe("listed problems", () => {
  it("lists only problems the catalog has not hidden", () => {
    const { sql, params } = render(listedProblem);
    expect(sql).toBe('"problems"."hidden" = $1');
    expect(params).toEqual([false]);
  });

  it("counts a hidden problem only for a user who already checked in on it", () => {
    const { sql, params } = render(countedFor("user-1"));
    expect(sql).toBe(
      '("problems"."hidden" = $1 or exists (select 1 from "checkins" where "checkins"."user_id" = $2 and "checkins"."problem_slug" = "problems"."slug"))',
    );
    expect(params).toEqual([false, "user-1"]);
  });

  it("keeps a card with no problem, and drops one whose problem is hidden", () => {
    // Left-joined: a card with no problem has a null `hidden`, which `is not true` keeps.
    expect(render(cardProblemListedJoined).sql).toBe('"problems"."hidden" is not true');
    // Not joined: only a matching hidden problem excludes the card.
    expect(render(cardProblemListed).sql).toBe(
      'not exists (select 1 from "problems" where "problems"."slug" = "cards"."problem_slug" and "problems"."hidden")',
    );
  });
});
