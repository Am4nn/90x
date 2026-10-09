import type { SVGProps } from "react";

const base: SVGProps<SVGSVGElement> = {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round",
  strokeLinejoin: "round",
  "aria-hidden": true,
};

export const TodayIcon = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base} {...p}>
    <rect x="3" y="4" width="18" height="17" rx="3" />
    <path d="M3 9h18M8 2v4M16 2v4" />
  </svg>
);
export const FeedIcon = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base} {...p}>
    <rect x="5" y="3" width="14" height="14" rx="3" />
    <path d="M8 21h8" />
  </svg>
);
export const LibraryIcon = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base} {...p}>
    <path d="M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2z" />
    <path d="M4 21V5" />
  </svg>
);
export const CoachIcon = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base} {...p}>
    <path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z" />
  </svg>
);
export const MeIcon = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base} {...p}>
    <circle cx="12" cy="8" r="4" />
    <path d="M4 21a8 8 0 0 1 16 0" />
  </svg>
);
export const FriendsIcon = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base} {...p}>
    <circle cx="9" cy="8" r="3.2" />
    <path d="M3 20a6 6 0 0 1 12 0" />
    <path d="M16.5 5.6a3 3 0 0 1 0 5.6" />
    <path d="M18 14.6A6 6 0 0 1 21.5 20" />
  </svg>
);
export const AdminIcon = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base} {...p}>
    <path d="M12 3l7 3v6c0 4.5-3 7.7-7 9-4-1.3-7-4.5-7-9V6z" />
  </svg>
);
export const ShareIcon = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base} {...p}>
    <path d="M12 3v12" />
    <path d="m7 8 5-5 5 5" />
    <path d="M5 13v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6" />
  </svg>
);
export const CopyIcon = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base} {...p}>
    <rect x="9" y="9" width="12" height="12" rx="2" />
    <path d="M5 15V5a2 2 0 0 1 2-2h10" />
  </svg>
);

// Audio player (the "Audio Lessons Player" mock). Play and pause are filled shapes; the rest share `base`.
export const PlayIcon = (p: SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden {...p}>
    <path d="M7 4.5v15l12-7.5z" />
  </svg>
);
export const PauseIcon = (p: SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden {...p}>
    <path d="M6 4h4v16H6zM14 4h4v16h-4z" />
  </svg>
);
export const ChevronDownIcon = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base} {...p}>
    <path d="M6 9l6 6 6-6" />
  </svg>
);
export const CheckIcon = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base} strokeWidth={2.5} {...p}>
    <path d="M5 12.5l4.5 4.5L19 7.5" />
  </svg>
);
/** A circular arrow with "15" inside; `forward` mirrors it. */
export const Skip15Icon = ({ forward = false, ...p }: SVGProps<SVGSVGElement> & { forward?: boolean }) => (
  <svg {...base} strokeWidth={1.6} {...p}>
    <path d={forward ? "M12 4.5a7.5 7.5 0 1 0 7 4.9" : "M12 4.5a7.5 7.5 0 1 1-7 4.9"} />
    <path d={forward ? "M19.2 3.2V9h-5.8" : "M4.8 3.2V9h5.8"} />
    <text x="12" y="15.4" textAnchor="middle" fontSize="7.5" fontWeight="700" fill="currentColor" stroke="none">
      15
    </text>
  </svg>
);
export const SpinnerIcon = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base} strokeWidth={2.5} {...p}>
    <path d="M12 3a9 9 0 1 1-6.4 2.6" />
  </svg>
);
