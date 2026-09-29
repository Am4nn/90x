/** Page title plus up to two actions. Accepts one node or a small list. */
export function PageHeader({ title, action }: { title: string; action?: React.ReactNode | React.ReactNode[] }) {
  const actions = action == null ? [] : Array.isArray(action) ? action : [action];
  return (
    <header className="flex min-h-9 flex-wrap items-center justify-between gap-4">
      <h1 className="font-display text-title font-semibold tracking-tight">{title}</h1>
      {actions.length > 0 && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}
