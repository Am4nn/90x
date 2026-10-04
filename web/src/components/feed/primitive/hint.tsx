/** The one muted line between a question and its answer area; it changes with state. */
export function Hint({ children }: { children: React.ReactNode }) {
  return <p className="-mt-2 text-small text-mute">{children}</p>;
}

/** The small caps label over a group of choices ("Terms", "Your order", "To sort"). */
export function Eyebrow({ children }: { children: React.ReactNode }) {
  return <h3 className="text-tag font-bold tracking-eyebrow text-mute uppercase">{children}</h3>;
}
