/** The app's public origin, for absolute URLs in link previews, robots.txt and the sitemap. */
export const siteUrl = () => new URL(process.env.NEXT_PUBLIC_APP_URL || "https://90x.amanarya.com");
