// Shared by the splash (server) and SplashDone (client): a "use client"
// module can't hand a plain constant to a server component.
export const SPLASH_SEEN_KEY = "90x-splash-seen";

/**
 * Runs in <head> before the splash is parsed. Once this tab has shown it, the
 * splash is hidden, so reloads and in-app navigations don't flash it.
 *
 * There used to be a second branch here that skipped the draw animation when
 * `navigator.standalone` said we were the Home Screen app. Nothing animates now,
 * so there is one behaviour - which also removes a dependence on a property that
 * is not reliably set.
 */
export const splashHeadScript = `try{if(sessionStorage.getItem(${JSON.stringify(SPLASH_SEEN_KEY)}))document.documentElement.classList.add("splash-seen")}catch(e){}`;
