export function Logo({ className = "" }: { className?: string }) {
  return (
    <span className={`font-display text-title font-bold tracking-tight ${className}`}>
      90<span className="text-cyan">X</span>
    </span>
  );
}
