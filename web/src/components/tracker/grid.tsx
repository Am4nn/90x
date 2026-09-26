const LABEL: Record<string, string> = {
  done: "done",
  revived: "revived",
  partial: "partly done",
  missed: "missed",
  rest: "rest day (nothing to count)",
  pending: "in progress",
  future: "ahead",
};

/** The 90 Grid: one square per campaign day. Today's X stamps in when the day is finished. */
export function Grid({ days, today }: { days: { date: string; status: string }[]; today?: string }) {
  const done = days.filter((d) => d.status === "done" || d.status === "revived").length;
  return (
    <div className="grid grid-cols-15 gap-1.5" role="img" aria-label={`${done} of ${days.length} days done`}>
      {days.map((d) => (
        <div
          key={d.date}
          className="sq"
          data-s={d.status}
          data-today={d.date === today || undefined}
          data-stamp={(d.date === today && d.status === "done") || undefined}
          title={`${d.date}: ${LABEL[d.status] ?? d.status}`}
        />
      ))}
    </div>
  );
}
