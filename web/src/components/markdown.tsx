import ReactMarkdown, { type Components } from "react-markdown";
import rehypeSanitize from "rehype-sanitize";
import remarkGfm from "remark-gfm";

// Defined once, outside render, so React keeps the same component identities.
const COMPONENTS: Components = {
  h1: (p) => <h2 className="mt-2 font-display text-title font-semibold text-text" {...p} />,
  h2: (p) => <h3 className="mt-2 font-display text-heading font-semibold text-text" {...p} />,
  h3: (p) => <h4 className="font-display text-heading font-semibold text-text" {...p} />,
  h4: (p) => <h5 className="font-semibold text-text" {...p} />,
  ul: (p) => <ul className="flex list-disc flex-col gap-1.5 pl-5" {...p} />,
  ol: (p) => <ol className="flex list-decimal flex-col gap-1.5 pl-5" {...p} />,
  code: ({ className, children, ...p }) =>
    className ? (
      <code className={`${className} block`} {...p}>
        {children}
      </code>
    ) : (
      <code className="rounded-md bg-surface-2 px-1.5 py-0.5 text-small text-text" {...p}>
        {children}
      </code>
    ),
  // A fence with no language reaches `code` with no className, so it gets the inline
  // pill; inside a block that pill is cleared, or its fill would hide the edge shade.
  pre: (p) => (
    <pre
      className="scroll-fade-x overflow-x-auto rounded-xl border border-line bg-surface p-4 text-small leading-relaxed text-text [--scroll-fade-bg:var(--x-surface)] [&>code]:rounded-none [&>code]:bg-transparent [&>code]:p-0"
      {...p}
    />
  ),
  table: (p) => (
    <div className="overflow-x-auto rounded-xl border border-line">
      <table
        className="w-full text-small [&_td]:border-t [&_td]:border-line [&_td]:px-3 [&_td]:py-2 [&_th]:px-3 [&_th]:py-2 [&_th]:text-left [&_th]:text-text"
        {...p}
      />
    </div>
  ),
  img: ({ alt, ...p }) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img alt={alt ?? ""} loading="lazy" className="max-w-full rounded-lg border border-line bg-white" {...p} />
  ),
  blockquote: (p) => <blockquote className="border-l-2 border-line-2 pl-4 text-mute" {...p} />,
  a: ({ href, ...p }) => <a href={href} target="_blank" rel="noreferrer" {...p} />,
};

/**
 * Raw HTML is never rendered, so a `<sup>` would lose its tag and keep its text:
 * 10<sup>4</sup> would read as "104". Turn it into a caret first (10^4, 2^(n - 1)),
 * which also reads right inside a code span, where no tag could. An ordinal
 * (i<sup>th</sup>) runs together instead. Statements are stored with carets
 * already; this covers any text that still has the tag.
 */
export function superscriptsAsCarets(md: string): string {
  // A fenced block (closed, or open to the end) is code shown as code, so it is matched
  // first and kept as it is: a lesson about HTML may well show a literal <sup>.
  return md.replace(
    /(^[ \t]*(`{3,}|~{3,})[\s\S]*?(?:^[ \t]*\2[^\n]*$|(?![\s\S])))|<sup>([\s\S]*?)<\/sup>/gim,
    (whole: string, fence: string | undefined, _mark: string | undefined, inner: string | undefined) => {
      if (fence !== undefined || inner === undefined) return whole;
      const text = inner.replace(/<[^>]*>/g, "");
      const exp = text.trim();
      if (["", "st", "nd", "rd", "th"].includes(exp)) return text;
      return /^-?\w+$/.test(exp) ? `^${exp}` : `^(${exp})`;
    },
  );
}

/** Notes and statements from open sources, rendered in the 90x type scale. */
export function Markdown({ children, feed = false }: { children: string; feed?: boolean }) {
  return (
    <div
      className={`flex flex-col gap-4 ${feed ? "text-text" : "leading-relaxed text-text-2"} [&_a]:text-cyan [&_a]:underline-offset-2 hover:[&_a]:underline [&_strong]:text-text`}
    >
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[[rehypeSanitize, { protocols: { src: ["https"] } }]]}
        components={COMPONENTS}
      >
        {superscriptsAsCarets(children)}
      </ReactMarkdown>
    </div>
  );
}
