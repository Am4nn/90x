"use client";

import * as Sentry from "@sentry/nextjs";
import Link from "next/link";
import { useEffect } from "react";
import { PageHeader } from "./page-header";

/** Shared body for every error.tsx: keep the header, say nothing changed, offer a retry. */
export function RouteError({
  error,
  retry,
  title,
  back,
  backLabel,
}: {
  error: Error & { digest?: string };
  retry: () => void;
  title: string;
  back?: string;
  backLabel?: string;
}) {
  useEffect(() => {
    Sentry.captureException(error);
    console.error(error);
  }, [error]);
  return (
    <>
      <PageHeader title={title} />
      <div role="alert" className="flex flex-col gap-4 rounded-xl border border-bad/40 bg-surface p-5">
        <div className="flex flex-col gap-1">
          <span className="font-semibold">This didn&apos;t load. Nothing was changed.</span>
          {error.digest && <span className="text-small text-mute">Reference {error.digest}</span>}
        </div>
        <div className="flex gap-2">
          <button onClick={retry} className="h-10 rounded-xl bg-cyan px-4 text-small font-semibold text-on-cyan">
            Try again
          </button>
          {back && (
            <Link href={back} className="flex h-10 items-center rounded-xl border border-line-2 px-4 text-small font-semibold text-text-2">
              {backLabel ?? "Back"}
            </Link>
          )}
        </div>
      </div>
    </>
  );
}
