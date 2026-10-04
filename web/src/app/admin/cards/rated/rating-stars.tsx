// One tone per whole-star average, written out so Tailwind sees each class.
const TONE = ["text-rate-1", "text-rate-2", "text-rate-3", "text-rate-4", "text-rate-5"] as const;

/** Five stars with the average's nearest whole number filled in. The exact figure is printed beside it. */
export function RatingStars({ value }: { value: number }) {
  const filled = Math.min(5, Math.max(0, Math.round(value)));
  return (
    <span role="img" aria-label={`${value} out of 5 stars`} className={`flex ${TONE[Math.max(0, filled - 1)]}`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <svg
          key={n}
          viewBox="0 0 24 24"
          className={`size-4.5 ${n <= filled ? "" : "text-mute"}`}
          fill={n <= filled ? "currentColor" : "none"}
          stroke="currentColor"
          strokeWidth={1.8}
          strokeLinejoin="round"
          aria-hidden
        >
          <path d="M12 3.2l2.6 5.5 6 .8-4.4 4.1 1.1 6-5.3-2.9-5.3 2.9 1.1-6L3.4 9.5l6-.8L12 3.2z" />
        </svg>
      ))}
    </span>
  );
}
