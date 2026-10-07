"use client";

import { glideTo } from "@/lib/landing/smooth-scroll";

/** The nav's text link, desktop only. Without script it is an ordinary #how anchor; with it, the glide the scroll hint uses, shorter. */
export function HowLink() {
  return (
    <a
      href="#how"
      onClick={(event) => {
        const target = document.getElementById("how");
        if (!target) return;
        event.preventDefault();
        glideTo(target.getBoundingClientRect().top + window.scrollY, 1.2);
        history.replaceState(null, "", "#how");
      }}
      className="hidden h-10 items-center rounded-lg px-1 text-nav font-semibold whitespace-nowrap text-text-2 transition-colors hover:text-text @wide:flex"
    >
      How it works
    </a>
  );
}
