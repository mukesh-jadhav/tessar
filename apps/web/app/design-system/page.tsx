/**
 * /design-system — Internal component gallery.
 *
 * Gated behind ?internal=1 so it isn't discoverable by users on the
 * marketing site. The actual gallery lives in ./_view.tsx (client).
 */
import { notFound } from "next/navigation";

import DesignSystemView from "./_view";

export default async function DesignSystemPage({
  searchParams,
}: {
  searchParams: Promise<{ internal?: string }>;
}): Promise<React.ReactElement> {
  const sp = await searchParams;
  if (sp.internal !== "1") notFound();
  return <DesignSystemView />;
}
