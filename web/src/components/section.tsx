/** A titled block of the shell: a heading, an optional hint line, then the
 *  children. The two call sites style the wrapper differently (a bare stack on
 *  the Plan page, a card on the mock picker), so the wrapper class is passed in. */
export function Section({
  title,
  hint,
  className,
  children,
}: {
  title: string;
  hint?: string;
  className: string;
  children: React.ReactNode;
}) {
  return (
    <section className={className}>
      <div>
        <h2 className="font-display text-heading font-semibold">{title}</h2>
        {hint && <p className="text-small text-mute">{hint}</p>}
      </div>
      {children}
    </section>
  );
}
