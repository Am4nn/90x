/** The bottom line: the wordmark and where the code lives. */
export function Footer() {
  return (
    <footer className="relative z-1 border-t border-line">
      <div className="mx-auto flex max-w-content flex-wrap items-center gap-x-6 gap-y-3 px-gutter py-6 text-small leading-none font-medium text-mute">
        <span className="font-display text-heading leading-none font-bold text-text">
          90<span className="text-cyan">x</span>
        </span>
        <span className="flex-1" />
        <a href="https://github.com/Am4nn/90x" className="rounded-sm text-text-2 transition-colors hover:text-cyan-hi">
          Source on GitHub
        </a>
      </div>
    </footer>
  );
}
