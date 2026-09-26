/** Page title plus at most one action. */
export function PageHeader({ title, action }: { title: string; action?: React.ReactNode }) {
  return (
    <header className="flex min-h-9 items-center justify-between gap-4">
      <h1 className="font-display text-title font-semibold tracking-tight">{title}</h1>
      {action}
    </header>
  );
}
