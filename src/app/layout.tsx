import type { Metadata, Viewport } from "next";
import "./globals.css";
import ThemeToggle from "@/components/ThemeToggle";
import RegisterServiceWorker from "@/components/RegisterServiceWorker";
import InstallPrompt from "@/components/InstallPrompt";

export const metadata: Metadata = {
  title: "Nutrition Tracker",
  description:
    "Snap photos of your meals and track nutrition against personalized daily targets.",
  /** PWA manifest. Drives "Add to Home Screen" on Android, install prompts
   *  in desktop browsers, and the icon shown in the Apps drawer once
   *  installed. */
  manifest: "/manifest.webmanifest",
  /** Icon set:
   *   - favicon (16/32 PNG) for browser tabs
   *   - apple-touch-icon (180x180) for iOS home screen — iOS rounds it itself
   *   - PWA manifest icons live in the manifest, not here. */
  icons: {
    icon: [
      { url: "/favicon-32.png", sizes: "32x32", type: "image/png" },
      { url: "/favicon-16.png", sizes: "16x16", type: "image/png" },
    ],
    apple: [
      { url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" },
    ],
    shortcut: "/favicon-32.png",
  },
  /** iOS-specific PWA hints. `capable: true` makes Safari treat the page as
   *  a fullscreen app once added to the home screen (no Safari chrome on
   *  launch). statusBarStyle "default" keeps the iOS status bar text dark
   *  on our eggshell background. */
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Nutrition",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  /** Theme color tints the Android Chrome address bar and the iOS status
   *  bar (as a fallback). Match the page background per scheme so the
   *  chrome blends with the app surface — eggshell in light, near-black
   *  in dark — instead of the default white the browser would otherwise
   *  pick. */
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#0a0a0a" },
    { media: "(prefers-color-scheme: light)", color: "#fef3c7" },
  ],
};

/**
 * Pre-hydration theme script. Runs synchronously before React paints to
 * prevent a light-to-dark flash. Reads an explicit user choice from
 * localStorage first; otherwise falls back to OS preference.
 */
const THEME_INIT_SCRIPT = `
(function () {
  try {
    var stored = localStorage.getItem('theme');
    var prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    var dark = stored ? stored === 'dark' : prefersDark;
    if (dark) document.documentElement.classList.add('dark');
  } catch (e) {}
})();
`;

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body className="min-h-screen antialiased">
        {children}
        <ThemeToggle />
        <InstallPrompt />
        <RegisterServiceWorker />
      </body>
    </html>
  );
}
