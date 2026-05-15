/**
 * /decide — Canned design-system demo of the studio.
 *
 * Renders <DecideStudio /> with the default (sample) data bundle and
 * the sample-switcher chip enabled in the top bar. The real per-run
 * experience lives at /decide/[id].
 */
"use client";

import { DecideStudio } from "@/components/decide/decide-studio";

export default function DecidePage(): React.ReactElement {
  return <DecideStudio meta={{ sampleSwitcher: true }} />;
}
