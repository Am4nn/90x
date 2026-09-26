/** What a section shows when there's nothing to show yet: say why, and what to do. */
export function EmptyState({ title, children, action }: { title: string; children?: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-start gap-2 rounded-xl border border-dashed border-line-2 px-4 py-5">
      <span className="font-semibold">{title}</span>
      {children && <p className="text-small text-mute">{children}</p>}
      {action}
    </div>
  );
}
