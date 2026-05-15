/**
 * /decide — Canned design-system demo of the studio.
 *
 * Internal-only: gated behind ?internal=1 so the marketing site doesn&apos;t
 * surface a fake-data sample as if it were a real run. The real
 * per-run experience lives at /decide/[id].
 */
import { notFound } from "next/navigation";

import { DecideStudio } from "@/components/decide/decide-studio";

export default async function DecidePage({
  searchParams,
}: {
  searchParams: Promise<{ internal?: string }>;
}): Promise<React.ReactElement> {
  const sp = await searchParams;
  if (sp.internal !== "1") notFound();
  return <DecideStudio meta={{ sampleSwitcher: true }} />;
}
