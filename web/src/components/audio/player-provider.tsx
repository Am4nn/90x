"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { audioUrl, saveAudioProgress } from "@/app/actions/audio";
import { audioPath, isDownloaded } from "@/lib/audio/offline";
import {
  clampSeek,
  COMPLETED_HOLD_MS,
  isFinished,
  keepLines,
  onError,
  shouldSave,
  SKIP_S,
  type Speed,
  type TimedLine,
} from "@/lib/audio/rules";
import type { FeedArea } from "@/lib/feed/view";

/** `area` colours the topic chip in the full player (null when the lesson is not in a Feed area). */
export type Track = {
  topicSlug: string;
  title: string;
  area: FeedArea | null;
  durationS: number;
  lines: TimedLine[];
  r2Key: string;
  src: string;
};
export type PlayerState = {
  track: Track | null;
  playing: boolean;
  positionS: number;
  durationS: number;
  rate: Speed;
  error: string | null;
  sheetOpen: boolean;
  /** Fetching a URL or buffering: the mock's "Loading…" mini-player. */
  loading: boolean;
  /** The lesson just played to its end: the bottom bar says Completed for a moment, then goes. */
  justFinished: boolean;
  /** Lessons heard to 95% in this visit, so their listen bar says Completed after the player has closed. */
  finishedSlugs: string[];
};
type Actions = {
  play(track: Omit<Track, "src">, startAt: number, rate: Speed): Promise<void>;
  toggle(): void;
  seek(s: number): void;
  skip(deltaS: number): void;
  setRate(r: Speed): void;
  retry(): void;
  openSheet(open: boolean): void;
  stop(): void;
  /** The loaded lesson again from 0:00. */
  restart(): void;
  /** Gives the playing lesson its transcript when it started without one (an older download). */
  setLines(r2Key: string, lines: TimedLine[]): void;
};
const CANT_PLAY = "Can't play right now";
const Ctx = createContext<(PlayerState & Actions) | null>(null);

/** A URL to play from: the downloaded copy when there is one, else a fresh signed URL. */
async function getSrc(topicSlug: string, r2Key: string): Promise<string | null> {
  if (!r2Key) return null; // a track with no file has nothing to play
  // The e2e build plays a local file instead of a signed R2 URL (ci.yml). Never set in Vercel.
  if (process.env.NEXT_PUBLIC_E2E_AUDIO_SRC) return process.env.NEXT_PUBLIC_E2E_AUDIO_SRC;
  // A downloaded lesson plays from the device (the service worker answers its stable path), so it works offline.
  if (await isDownloaded(r2Key)) return audioPath(r2Key);
  try {
    const result = await audioUrl(topicSlug);
    return "url" in result ? result.url : null;
  } catch {
    // Offline or a server error: the action rejects. null shows "Can't play right now" instead of a spinner forever.
    return null;
  }
}

export function PlayerProvider({ children }: { children: React.ReactNode }) {
  const audio = useRef<HTMLAudioElement | null>(null);
  const [state, setState] = useState<PlayerState>({
    track: null,
    playing: false,
    positionS: 0,
    durationS: 0,
    rate: 1,
    error: null,
    sheetOpen: false,
    loading: false,
    justFinished: false,
    finishedSlugs: [],
  });
  const retried = useRef(false);
  // A transcript fetched for a file that may still be loading (setLines): play() keeps it when it assigns the track.
  const fetchedLines = useRef<{ r2Key: string; lines: TimedLine[] } | null>(null);
  const lastSaved = useRef(0);
  // The latest state for event handlers, which outlive a render. Synced after each render: React
  // forbids writing a ref while rendering.
  const live = useRef(state);
  useEffect(() => {
    live.current = state;
  }, [state]);

  const save = useCallback((reason: "tick" | "pause" | "seek" | "hide") => {
    const s = live.current;
    const el = audio.current;
    if (!s.track || !el) return;
    const now = Date.now();
    if (!shouldSave(lastSaved.current, now, reason)) return;
    lastSaved.current = now;
    const body = {
      topicSlug: s.track.topicSlug,
      positionS: el.currentTime,
      rate: s.rate,
      finished: isFinished(el.currentTime, el.duration || s.durationS),
    };
    if (reason === "hide") {
      // A server action started during pagehide is dropped by the browser; a beacon is not.
      navigator.sendBeacon("/api/audio/progress", new Blob([JSON.stringify(body)], { type: "application/json" }));
      return;
    }
    void saveAudioProgress(body);
  }, []);

  // One element for the whole app, created once; the (app) layout never remounts across navigation.
  useEffect(() => {
    const el = new Audio();
    el.preload = "metadata";
    // In the document (hidden) so tests and devtools can find the one element.
    el.hidden = true;
    document.body.append(el);
    audio.current = el;
    const onTime = () => {
      setState((s) => {
        const durationS = el.duration || s.durationS;
        const slug = s.track?.topicSlug;
        const heard = slug && isFinished(el.currentTime, durationS) && !s.finishedSlugs.includes(slug);
        return { ...s, positionS: el.currentTime, durationS, finishedSlugs: heard ? [...s.finishedSlugs, slug] : s.finishedSlugs };
      });
      save("tick");
      if ("mediaSession" in navigator && el.duration)
        navigator.mediaSession.setPositionState({ duration: el.duration, playbackRate: el.playbackRate, position: el.currentTime });
    };
    const onPlay = () => setState((s) => ({ ...s, playing: true, error: null, justFinished: false }));
    const onWaiting = () => setState((s) => ({ ...s, loading: true }));
    const onPlaying = () => setState((s) => ({ ...s, loading: false }));
    const onPause = () => {
      setState((s) => ({ ...s, playing: false }));
      save("pause");
    };
    const onEnded = () => {
      setState((s) => ({ ...s, playing: false, justFinished: true }));
      save("pause");
    };
    const onErr = async () => {
      const s = live.current;
      if (!s.track) return;
      const next = onError({ retried: retried.current });
      retried.current = next.retried;
      if (next.action === "fail") {
        setState((p) => ({ ...p, playing: false, error: CANT_PLAY, loading: false }));
        return;
      }
      const at = el.currentTime;
      const src = await getSrc(s.track.topicSlug, s.track.r2Key);
      if (!src) {
        setState((p) => ({ ...p, playing: false, error: CANT_PLAY, loading: false }));
        return;
      }
      el.src = src;
      el.defaultPlaybackRate = s.rate;
      el.playbackRate = s.rate;
      el.currentTime = at;
      el.play().catch(() => setState((p) => ({ ...p, playing: false, error: CANT_PLAY, loading: false })));
    };
    const onHide = () => {
      if (document.visibilityState === "hidden") save("hide");
    };
    el.addEventListener("timeupdate", onTime);
    el.addEventListener("play", onPlay);
    el.addEventListener("waiting", onWaiting);
    el.addEventListener("playing", onPlaying);
    el.addEventListener("canplay", onPlaying);
    el.addEventListener("pause", onPause);
    el.addEventListener("ended", onEnded);
    el.addEventListener("error", onErr);
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("pagehide", onHide);
    return () => {
      el.pause();
      el.remove();
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("pagehide", onHide);
    };
  }, [save]);

  useEffect(() => {
    document.documentElement.classList.toggle("has-player", state.track !== null);
  }, [state.track]);

  // A finished lesson's bottom bar says Completed for a moment, then the player closes. Not while the full
  // player is open: it closes once the person collapses it.
  const stopRef = useRef<() => void>(() => {});
  useEffect(() => {
    if (!state.justFinished || state.sheetOpen) return;
    const timer = setTimeout(() => stopRef.current(), COMPLETED_HOLD_MS);
    return () => clearTimeout(timer);
  }, [state.justFinished, state.sheetOpen]);

  const seek = useCallback(
    (s: number) => {
      const el = audio.current;
      if (!el) return;
      el.currentTime = clampSeek(s, el.duration || live.current.durationS);
      setState((p) => ({ ...p, positionS: el.currentTime }));
      save("seek");
    },
    [save],
  );

  const play = useCallback(
    async (track: Omit<Track, "src">, startAt: number, rate: Speed) => {
      const el = audio.current;
      if (!el) return;
      retried.current = false;
      setState((p) => ({ ...p, track: p.track ?? { ...track, src: "" }, loading: true, error: null, justFinished: false }));
      const src = await getSrc(track.topicSlug, track.r2Key);
      if (!src) {
        setState((p) => ({ ...p, track: { ...track, src: "" }, loading: false, error: CANT_PLAY }));
        return;
      }
      el.src = src;
      // Loading a source resets playbackRate to defaultPlaybackRate, so both carry the chosen speed.
      el.defaultPlaybackRate = rate;
      el.playbackRate = rate;
      el.currentTime = startAt;
      setState((p) => ({
        ...p,
        track: { ...track, lines: keepLines(track.lines, track.r2Key, fetchedLines.current), src },
        positionS: startAt,
        durationS: track.durationS,
        rate,
        error: null,
      }));
      if ("mediaSession" in navigator) {
        navigator.mediaSession.metadata = new MediaMetadata({
          title: track.title,
          artist: "90x",
          artwork: [{ src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" }],
        });
        navigator.mediaSession.setActionHandler("play", () => el.play());
        navigator.mediaSession.setActionHandler("pause", () => el.pause());
        navigator.mediaSession.setActionHandler("seekbackward", () => seek(el.currentTime - SKIP_S));
        navigator.mediaSession.setActionHandler("seekforward", () => seek(el.currentTime + SKIP_S));
        navigator.mediaSession.setActionHandler("seekto", (d) => {
          if (d.seekTime != null) seek(d.seekTime);
        });
      }
      await el.play().catch(() => setState((p) => ({ ...p, error: CANT_PLAY, loading: false })));
    },
    [seek],
  );

  const actions = useMemo<Actions>(
    () => ({
      play,
      toggle() {
        const el = audio.current;
        if (!el || !live.current.track) return;
        if (el.paused) void el.play();
        else el.pause();
      },
      seek,
      skip(deltaS) {
        const el = audio.current;
        if (el) seek(el.currentTime + deltaS);
      },
      setRate(r) {
        const el = audio.current;
        if (el) {
          el.defaultPlaybackRate = r;
          el.playbackRate = r;
        }
        setState((p) => ({ ...p, rate: r }));
        lastSaved.current = 0;
        save("seek");
      },
      retry() {
        const t = live.current.track;
        if (t) {
          retried.current = false;
          void play(t, live.current.positionS, live.current.rate);
        }
      },
      openSheet(open) {
        setState((p) => ({ ...p, sheetOpen: open }));
      },
      stop() {
        const el = audio.current;
        if (el) {
          el.pause();
          el.removeAttribute("src");
          el.load();
        }
        setState((p) => ({ ...p, track: null, playing: false, sheetOpen: false, error: null, loading: false, justFinished: false }));
      },
      setLines(r2Key, lines) {
        fetchedLines.current = { r2Key, lines };
        setState((p) => (p.track?.r2Key === r2Key ? { ...p, track: { ...p.track, lines } } : p));
      },
      restart() {
        const el = audio.current;
        if (!el || !live.current.track) return;
        seek(0);
        void el.play();
      },
    }),
    [play, save, seek],
  );
  useEffect(() => {
    stopRef.current = actions.stop;
  }, [actions]);

  const value = useMemo(() => ({ ...state, ...actions }), [state, actions]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function usePlayer() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("usePlayer outside PlayerProvider");
  return ctx;
}
