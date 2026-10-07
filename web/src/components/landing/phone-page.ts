/**
 * What makes a section one phone page: exactly one screen tall below 760px, snapping, never
 * scrolling inside, one padding on every page. The landing root's own width decides
 * (`@max-wide:`), not the window and not the user agent. The hero and the close are one DOM
 * restyled by CSS, so they take this box and keep their own display on a wide layout.
 */
export const PHONE_PAGE_BOX =
  "relative z-1 @max-wide:flex @max-wide:h-svh @max-wide:snap-start @max-wide:snap-always @max-wide:flex-col @max-wide:gap-3 @max-wide:overflow-hidden @max-wide:px-4 @max-wide:pt-page-top @max-wide:pb-page-bottom";

/** A section that exists only on a phone: not laid out at all on a wide layout (the wide sections it replaces carry `@max-wide:hidden`). */
export const PHONE_PAGE = `hidden ${PHONE_PAGE_BOX}`;
