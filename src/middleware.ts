import type { NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

export async function middleware(request: NextRequest) {
  return await updateSession(request);
}

export const config = {
  matcher: [
    // Run on all paths except Next internals and static assets.
    //
    // The negative lookahead skips:
    //   - _next/static, _next/image — Next build artifacts
    //   - favicon.ico                — historical alias for the tab icon
    //   - manifest.webmanifest       — PWA manifest (must be served raw,
    //                                  not redirected to /login on
    //                                  unauthenticated fetches)
    //   - sw.js                      — service worker (same reason)
    //   - any path ending in a static asset extension (icons, etc.)
    //
    // Without these exclusions the middleware would 302 the manifest /
    // SW to /login for signed-out visitors, and the browser would
    // parse the login HTML as JSON and fail with "Manifest: Line: 1,
    // column: 1, Syntax error."
    "/((?!_next/static|_next/image|favicon\\.ico|manifest\\.webmanifest|sw\\.js|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
