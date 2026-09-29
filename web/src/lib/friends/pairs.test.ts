import { describe, expect, it } from "vitest";
import { collectFriendIds, orderedPair } from "./pairs";

describe("orderedPair", () => {
  it("sorts so user_a < user_b", () => {
    expect(orderedPair("a", "z")).toEqual(["a", "z"]);
    expect(orderedPair("z", "a")).toEqual(["a", "z"]);
  });

  it("keeps equal ids as-is (a pair of the same user is not valid, but must not crash)", () => {
    expect(orderedPair("x", "x")).toEqual(["x", "x"]);
  });
});

describe("collectFriendIds", () => {
  it("always includes the viewer first", () => {
    expect(collectFriendIds("me", [])).toEqual(["me"]);
  });

  it("adds each friend once, in first-seen order, regardless of column", () => {
    expect(
      collectFriendIds("me", [
        { userA: "bob", userB: "me" },
        { userA: "alice", userB: "me" },
        { userA: "bob", userB: "me" }, // duplicate pair, must not repeat
      ]),
    ).toEqual(["me", "bob", "alice"]);
  });

  it("orders by the pair rows, not by name", () => {
    expect(collectFriendIds("me", [{ userA: "zebra", userB: "me" }])).toEqual(["me", "zebra"]);
  });
});
