export type Approval = "pending" | "approved" | "rejected" | null;

/** Where a visitor must go before seeing the app, or null to let them in. */
export function gate(state: { userId: string | null; approval: Approval; setupDone: boolean }): string | null {
  if (!state.userId) return "/";
  if (state.approval !== "approved") return "/pending";
  if (!state.setupDone) return "/setup";
  return null;
}
