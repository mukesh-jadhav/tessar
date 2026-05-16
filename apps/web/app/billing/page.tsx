/**
 * /billing — Mocked Stripe customer portal stand-in.
 *
 * Server boundary: reads the signed-in user from Auth.js so the page
 * surfaces the real email (and name when present) instead of a hard-
 * coded placeholder. Body is the client component.
 */
import { redirect } from "next/navigation";

import { auth } from "@/auth";

import { BillingClient } from "./billing-client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function BillingPage(): Promise<React.ReactElement> {
  const session = await auth();
  if (!session?.user?.email) {
    redirect(`/signin?from=${encodeURIComponent("/billing")}`);
  }
  return <BillingClient email={session.user.email} name={session.user.name ?? null} />;
}
