import type { HowStep } from "@/lib/landing/how";

const PATHS: Record<HowStep["icon"], React.ReactNode> = {
  plan: (
    <>
      <rect x="3.5" y="5" width="17" height="15.5" rx="2.5" />
      <path d="M8 3v4M16 3v4M3.5 10h17" />
      <path d="M8 14.5l2 2 4-4" />
    </>
  ),
  grade: (
    <>
      <rect x="3.5" y="3.5" width="17" height="17" rx="3" />
      <path d="M7.5 12.5l3 3 6-6.5" />
    </>
  ),
  readiness: (
    <>
      <path d="M3.5 20.5h17" />
      <path d="M5 16l4.5-4.5 3.5 3 6-6.5" />
      <path d="M14.5 8H19v4.5" />
    </>
  ),
};

/** The step's icon, in the mock's own paths, inside a cyan-tinted tile. Decorative: the step's title says it. */
export function HowIcon({ icon, tile = "size-11" }: { icon: HowStep["icon"]; tile?: string }) {
  return (
    <span
      aria-hidden="true"
      className={`flex flex-none items-center justify-center rounded-xl border border-cyan-deep bg-cyan-bg text-cyan ${tile}`}
    >
      <svg
        className="size-1/2"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {PATHS[icon]}
      </svg>
    </span>
  );
}
