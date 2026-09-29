"use client";

import { RouteError } from "@/components/route-error";

export default function Error(props: { error: Error & { digest?: string }; retry: () => void }) {
  return <RouteError {...props} title="Lessons" back="/coach" backLabel="Coach" />;
}
