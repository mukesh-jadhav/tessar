"use server";

import { signOut } from "@/auth";

/* ---------------------------------------------------------------------------
 * Server actions for client-triggered auth changes.
 *
 * `signOut` is normally a server-side helper; wrapping it in a server
 * action lets the <UserMenu /> client component invoke it via <form>
 * without needing to ship the full auth machinery to the browser.
 * ------------------------------------------------------------------------- */

export async function signOutAction(): Promise<void> {
  await signOut({ redirectTo: "/" });
}
