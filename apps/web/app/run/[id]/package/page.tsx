/**
 * /run/[id]/package — DEPRECATED.
 *
 * The post-completion viewer has moved to /decide/[id], a single-viewport
 * data-driven workspace that reuses the /decide design language.
 *
 * Keep this route as a redirect so any external bookmarks (emails,
 * shared links) survive. Auth is enforced on the new route.
 */
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<never> {
  const { id } = await params;
  redirect(`/decide/${id}`);
}
