// One set of button and chip shapes: three heights plus two square
// icon sizes, three variants, one radius per height and one disabled look.
// Callers add only layout (flex-1, self-start). Links and buttons share them.

type Variant = "primary" | "secondary" | "ghost";
type Size = "sm" | "md" | "lg" | "icon-sm" | "icon";

const BASE =
  "inline-flex items-center justify-center gap-2 font-semibold whitespace-nowrap transition-colors disabled:opacity-50 aria-disabled:opacity-50";

const VARIANT: Record<Variant, string> = {
  primary: "bg-cyan text-on-cyan hover:bg-cyan/90",
  secondary: "border border-line-2 bg-surface text-text hover:border-mute hover:bg-surface-2",
  ghost: "text-text-2 hover:bg-surface-2 hover:text-text",
};

const SIZE: Record<Size, string> = {
  sm: "h-9 rounded-lg px-3 text-small",
  md: "h-10 rounded-xl px-4 text-small",
  lg: "h-11 rounded-xl px-5 text-body",
  "icon-sm": "size-9 rounded-lg",
  icon: "size-10 rounded-xl",
};

/** Class names for a button or a link styled as one. */
export function button({ variant = "secondary", size = "md" }: { variant?: Variant; size?: Size } = {}) {
  return `${BASE} ${VARIANT[variant]} ${SIZE[size]}`;
}

/** Class names for a toggle chip (single or multi choice); `on` is the selected look. */
export function chip(on: boolean) {
  return `inline-flex h-9 shrink-0 items-center justify-center gap-2 rounded-full border px-3.5 text-small font-semibold transition-colors disabled:opacity-50 ${
    on ? "border-cyan bg-cyan-bg text-cyan" : "border-line-2 text-text-2 hover:border-mute hover:text-text"
  }`;
}
