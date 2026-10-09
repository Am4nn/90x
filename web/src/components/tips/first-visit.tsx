"use client";

import { useState } from "react";
import { Welcome, type WelcomeProps } from "@/components/tracker/welcome";
import type { TipId } from "@/lib/tips";
import { Demo } from "./demo";

// Today's first visit: the welcome, then the demo once it closes. An account that
// saw the welcome before the demo existed gets just the demo.
export function FirstVisit({ welcome, steps }: { welcome: WelcomeProps | null; steps: TipId[] }) {
  const [welcomeOpen, setWelcomeOpen] = useState(welcome !== null);
  return (
    <>
      {welcome && <Welcome {...welcome} onClosed={() => setWelcomeOpen(false)} />}
      {!welcomeOpen && steps.length > 0 && <Demo steps={steps} />}
    </>
  );
}
