// What one press of Share or Copy does, apart from the browser: ShareDay passes in navigator.share,
// the clipboard and the admin counter, so the counting rules can be tested without a DOM.
// A share that went through, or a copy, counts once; closing the share sheet counts nothing.

export type CopyOutcome = "copied" | "not-copied";
export type ShareOutcome = "shared" | "cancelled" | CopyOutcome;

export type CopySteps = {
  /** Writes the link to the clipboard; throws when it cannot. */
  copy: () => Promise<void>;
  /** Counts a share for admin Analytics. */
  counted: () => void;
};

export type ShareSteps = CopySteps & {
  /** From shareMode: share the PNG, share the link, or neither (copy instead). */
  mode: "files" | "link" | "none";
  /** navigator.share, with the PNG when `withFile`. */
  share: (withFile: boolean) => Promise<void>;
};

/** Copy the link; counted only when it was copied. */
export async function copyLink(steps: CopySteps): Promise<CopyOutcome> {
  try {
    await steps.copy();
  } catch {
    return "not-copied";
  }
  steps.counted();
  return "copied";
}

const isAbort = (e: unknown) => e instanceof DOMException && e.name === "AbortError";

/** Share through the device's sheet, falling back to a copy; whichever happens is counted once. */
export async function shareOrCopy(steps: ShareSteps): Promise<ShareOutcome> {
  if (steps.mode === "none") return copyLink(steps);
  try {
    await steps.share(steps.mode === "files");
  } catch (e) {
    // Closing the sheet is a choice, not a failure.
    if (isAbort(e)) return "cancelled";
    return copyLink(steps);
  }
  steps.counted();
  return "shared";
}
