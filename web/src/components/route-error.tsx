"use client";

import * as Sentry from "@sentry/nextjs";
import Link from "next/link";
import { useEffect, useRef } from "react";
import { button } from "@/components/button-styles";
import { useOnline } from "@/components/offline/use-online";
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
  const online = useOnline();
  // Coming back online after seeing the offline message tries the page again by itself.
  const wasOffline = useRef(false);
  useEffect(() => {
    if (!online) wasOffline.current = true;
    else if (wasOffline.current) {
      wasOffline.current = false;
      retry();
    }
  }, [online, retry]);
  useEffect(() => {
    Sentry.captureException(error);
    console.error(error);
  }, [error]);
  // Offline, the page could not load because there is no connection, not because something broke.
  if (!online) {
    return (
      <>
        <PageHeader title={title} />
        <div role="alert" className="flex flex-col gap-4 rounded-xl border border-line bg-surface p-5">
          <div className="flex flex-col gap-1">
            <span className="font-semibold">You&apos;re offline.</span>
            <span className="text-small text-mute">
              This page isn&apos;t saved on this device yet. It will load once you&apos;re back online.
            </span>
          </div>
          {back && (
            <Link href={back} className={button({ variant: "primary" })}>
              {backLabel ?? "Back"}
            </Link>
          )}
        </div>
      </>
    );
  }
  return (
    <>
      <PageHeader title={title} />
      <div role="alert" className="flex flex-col gap-4 rounded-xl border border-bad/40 bg-surface p-5">
        <div className="flex flex-col gap-1">
          <span className="font-semibold">This didn&apos;t load. Nothing was changed.</span>
          {error.digest && <span className="text-small text-mute">Reference {error.digest}</span>}
        </div>
        <div className="flex gap-2">
          <button onClick={retry} className={button({ variant: "primary" })}>
            Try again
          </button>
          {back && (
            <Link href={back} className={button()}>
              {backLabel ?? "Back"}
            </Link>
          )}
        </div>
      </div>
    </>
  );
}

/** A whole error.tsx, given what differs between them.
 *
 *  Next wants a default-exported component per route, which had produced five
 *  boundaries identical but for a title and a back link. This keeps the shape in
 *  one place; each route exports `errorPage({ ... })` and nothing else. */
export function errorPage({
  title,
  back,
  backLabel,
  width = "max-w-3xl",
}: {
  title: string;
  back: string;
  backLabel: string;
  width?: string;
}) {
  return function RouteErrorPage(props: { error: Error & { digest?: string }; retry: () => void }) {
    return (
      <main className={`mx-auto flex w-full ${width} flex-col gap-6 px-5 py-8`}>
        <RouteError {...props} title={title} back={back} backLabel={backLabel} />
      </main>
    );
  };
}
