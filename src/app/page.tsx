import { redirect } from "next/navigation";

// Root route sends the user into the app. Middleware handles the auth gate:
// unauthenticated users get bounced to /login, authenticated users see /today.
export default function RootPage() {
  redirect("/today");
}
