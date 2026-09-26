import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

/** Notes and statements from open sources, rendered in the 90X type scale. */
export function Markdown({ children }: { children: string }) {
  return (
    <div className="flex flex-col gap-4 leading-[1.65] text-text-2 [&_a]:text-cyan [&_a]:underline-offset-2 hover:[&_a]:underline [&_strong]:text-text">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          h1: (p) => <h2 className="mt-2 font-display text-title font-semibold text-text" {...p} />,
          h2: (p) => <h3 className="mt-2 font-display text-heading font-semibold text-text" {...p} />,
          h3: (p) => <h4 className="font-display text-heading font-semibold text-text" {...p} />,
          h4: (p) => <h5 className="font-semibold text-text" {...p} />,
          ul: (p) => <ul className="flex list-disc flex-col gap-1.5 pl-5" {...p} />,
          ol: (p) => <ol className="flex list-decimal flex-col gap-1.5 pl-5" {...p} />,
          code: ({ className, children, ...p }) =>
            className ? (
              <code className={`${className} block`} {...p}>{children}</code>
            ) : (
              <code className="rounded-md bg-surface-2 px-1.5 py-0.5 text-[13px] text-text" {...p}>{children}</code>
            ),
          pre: (p) => <pre className="overflow-x-auto rounded-xl border border-line bg-surface p-4 text-[13px] leading-relaxed text-text" {...p} />,
          table: (p) => (
            <div className="overflow-x-auto rounded-xl border border-line">
              <table className="w-full text-small [&_td]:border-t [&_td]:border-line [&_td]:px-3 [&_td]:py-2 [&_th]:px-3 [&_th]:py-2 [&_th]:text-left [&_th]:text-text" {...p} />
            </div>
          ),
          img: ({ alt, ...p }) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img alt={alt ?? ""} loading="lazy" className="max-w-full rounded-lg border border-line bg-white" {...p} />
          ),
          blockquote: (p) => <blockquote className="border-l-2 border-line-2 pl-4 text-mute" {...p} />,
          a: ({ href, ...p }) => <a href={href} target="_blank" rel="noreferrer" {...p} />,
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}
