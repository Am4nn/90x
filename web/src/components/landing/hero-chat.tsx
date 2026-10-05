"use client";

import { useRef, useState } from "react";
import { CHAT_ANSWER, CHAT_CHAR_MS, CHAT_LOOP, CHAT_QUESTION, chatFrame, STILL_CHAT } from "@/lib/landing/chat";
import { useMotionPhase, useVisibleFrames } from "./use-motion";

/**
 * Under Ren: a question types out, then Ren's answer, and it loops. An illustration of
 * what the coach does, not a real conversation, so screen readers get the finished
 * exchange once, as text, and not every typed letter.
 */
export function HeroChat() {
  const phase = useMotionPhase();
  const chat = useRef<HTMLDivElement>(null);
  const [clock, setClock] = useState(0);
  useVisibleFrames(chat, phase === "live", (ms) => setClock((now) => (now + ms / CHAT_CHAR_MS) % CHAT_LOOP));
  const frame = phase === "live" ? chatFrame(clock) : STILL_CHAT;
  return (
    <div className="hidden w-full max-w-ren @wide:block">
      <p className="sr-only">
        Example. You ask Ren: {CHAT_QUESTION} Ren answers: {CHAT_ANSWER}
      </p>
      <div
        ref={chat}
        aria-hidden="true"
        data-pending={phase === "pending" ? "" : undefined}
        className="flex min-h-chat-min flex-col gap-chat-gap font-term text-chat font-medium"
      >
        <div className="flex gap-3">
          <span className="w-7.5 flex-none font-bold text-mute">you</span>
          <span className="text-text-2">{frame.question}</span>
        </div>
        {frame.answering && (
          <div className="flex gap-3">
            <span className="w-7.5 flex-none font-bold text-ren">ren</span>
            <span className="min-w-0 flex-1">
              {frame.answer}
              <span className={`relative top-0.5 ml-0.5 inline-block h-3.75 w-2 bg-cyan ${frame.typing ? "" : "opacity-0"}`} />
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
