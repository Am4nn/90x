// Shared by the splash (server) and SplashDone (client): a "use client"
// module can't hand a plain constant to a server component.
export const SPLASH_SEEN_KEY = "90x-splash-seen";

/**
 * Runs in <head> before the splash is parsed. Once this tab has shown it, the
 * splash is hidden (reloads and in-app navigations don't flash it). In the iOS
 * Home Screen app the launch image already showed the whole mark, so the
 * splash starts with it drawn instead of drawing it again.
 */
export const splashHeadScript = `try{var d=document.documentElement;if(sessionStorage.getItem(${JSON.stringify(SPLASH_SEEN_KEY)}))d.classList.add("splash-seen");else if(navigator.standalone)d.classList.add("splash-static")}catch(e){}`;
