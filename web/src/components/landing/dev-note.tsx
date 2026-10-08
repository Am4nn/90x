import { DEV_NOTE, DEV_NOTE_LABEL } from "@/lib/landing/copy";

/**
 * An honest word from the developer: this page is the showpiece, the app itself is quiet. It sits with the
 * footer, out of the hero's way: a pill in the wide footer, a plain muted line in the phone's.
 */
export function DevNote({ pill = false }: { pill?: boolean }) {
  return (
    <p
      data-landing="dev-note"
      className={
        pill
          ? "flex items-center gap-2 rounded-full border border-line-2 bg-surface px-3 py-1.5 text-tag leading-snug font-semibold text-mute"
          : // `relative`: painted above the footer links' tap boxes that reach down over it, so a tap on the note is the note's.
            "relative text-center text-tag leading-snug font-medium text-balance text-mute"
      }
    >
      {pill && <span aria-hidden="true" className="size-1.5 flex-none rounded-full bg-ren-hot" />}
      <span>
        <span data-landing="dev-note-label" className="font-term text-ren-hot">
          {DEV_NOTE_LABEL}
        </span>{" "}
        {DEV_NOTE}
      </span>
    </p>
  );
}
