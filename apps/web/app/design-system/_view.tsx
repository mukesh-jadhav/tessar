"use client";

import { useState } from "react";

import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardActions,
  CardBody,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Chip } from "@/components/ui/chip";
import { Fab } from "@/components/ui/fab";
import { IconButton } from "@/components/ui/icon-button";
import { Input } from "@/components/ui/input";
import { Sheet } from "@/components/ui/sheet";
import { WavyProgress } from "@/components/ui/wavy-progress";
import { SystemDesignPane } from "@/components/package/system-design-sections";
import {
  SAMPLE_BUILD_SEQUENCE,
  SAMPLE_COMPONENT_RATIONALES,
  SAMPLE_FAILURE_MODES,
  SAMPLE_INTEGRATION_CONTRACTS,
  SAMPLE_SEQUENCE_DIAGRAMS,
} from "@/lib/mocks/system-design-fixture";
import type { ArchNode } from "@/lib/run-package";

// Minimal node stubs so the rationale / failure-mode / build-sequence sections
// can render their pretty labels without dragging the full mock package in.
const SHOWCASE_NODES: ArchNode[] = [
  {
    id: "client",
    label: "Client",
    sub: "Web + mobile",
    zone: "client",
    icon: "",
    cite: 0,
    dataClass: "public",
    failureDomain: [],
    why: "",
    scale: [
      { tier: "1×", note: "" },
      { tier: "10×", note: "" },
      { tier: "100×", note: "" },
    ],
    alts: "",
    x: 0,
    y: 0,
    w: 0,
  },
  {
    id: "lb",
    label: "Global LB + Cloud Armor",
    sub: "Edge",
    zone: "edge",
    icon: "",
    cite: 0,
    dataClass: "public",
    failureDomain: [],
    why: "",
    scale: [
      { tier: "1×", note: "" },
      { tier: "10×", note: "" },
      { tier: "100×", note: "" },
    ],
    alts: "",
    x: 0,
    y: 0,
    w: 0,
  },
  {
    id: "cdn",
    label: "Cloud CDN",
    sub: "Edge cache",
    zone: "edge",
    icon: "",
    cite: 0,
    dataClass: "public",
    failureDomain: [],
    why: "",
    scale: [
      { tier: "1×", note: "" },
      { tier: "10×", note: "" },
      { tier: "100×", note: "" },
    ],
    alts: "",
    x: 0,
    y: 0,
    w: 0,
  },
  {
    id: "app",
    label: "App (Cloud Run)",
    sub: "Stateless",
    zone: "app",
    icon: "",
    cite: 0,
    dataClass: "internal",
    failureDomain: [],
    why: "",
    scale: [
      { tier: "1×", note: "" },
      { tier: "10×", note: "" },
      { tier: "100×", note: "" },
    ],
    alts: "",
    x: 0,
    y: 0,
    w: 0,
  },
  {
    id: "db",
    label: "Cloud SQL Postgres",
    sub: "Primary",
    zone: "data",
    icon: "",
    cite: 0,
    dataClass: "confidential",
    failureDomain: [],
    why: "",
    scale: [
      { tier: "1×", note: "" },
      { tier: "10×", note: "" },
      { tier: "100×", note: "" },
    ],
    alts: "",
    x: 0,
    y: 0,
    w: 0,
  },
  {
    id: "redis",
    label: "Memorystore Redis",
    sub: "Cache + streams",
    zone: "data",
    icon: "",
    cite: 0,
    dataClass: "internal",
    failureDomain: [],
    why: "",
    scale: [
      { tier: "1×", note: "" },
      { tier: "10×", note: "" },
      { tier: "100×", note: "" },
    ],
    alts: "",
    x: 0,
    y: 0,
    w: 0,
  },
  {
    id: "pubsub",
    label: "Pub/Sub",
    sub: "Job queue",
    zone: "data",
    icon: "",
    cite: 0,
    dataClass: "internal",
    failureDomain: [],
    why: "",
    scale: [
      { tier: "1×", note: "" },
      { tier: "10×", note: "" },
      { tier: "100×", note: "" },
    ],
    alts: "",
    x: 0,
    y: 0,
    w: 0,
  },
  {
    id: "worker",
    label: "Worker (Cloud Run)",
    sub: "Async",
    zone: "app",
    icon: "",
    cite: 0,
    dataClass: "internal",
    failureDomain: [],
    why: "",
    scale: [
      { tier: "1×", note: "" },
      { tier: "10×", note: "" },
      { tier: "100×", note: "" },
    ],
    alts: "",
    x: 0,
    y: 0,
    w: 0,
  },
  {
    id: "gcs",
    label: "Cloud Storage",
    sub: "Artifacts",
    zone: "data",
    icon: "",
    cite: 0,
    dataClass: "confidential",
    failureDomain: [],
    why: "",
    scale: [
      { tier: "1×", note: "" },
      { tier: "10×", note: "" },
      { tier: "100×", note: "" },
    ],
    alts: "",
    x: 0,
    y: 0,
    w: 0,
  },
  {
    id: "db_replica",
    label: "Cloud SQL read replica",
    sub: "Read scale",
    zone: "data",
    icon: "",
    cite: 0,
    dataClass: "confidential",
    failureDomain: [],
    why: "",
    scale: [
      { tier: "1×", note: "" },
      { tier: "10×", note: "" },
      { tier: "100×", note: "" },
    ],
    alts: "",
    x: 0,
    y: 0,
    w: 0,
  },
  {
    id: "db_replica_dr",
    label: "DR read replica",
    sub: "Cross-region",
    zone: "data",
    icon: "",
    cite: 0,
    dataClass: "confidential",
    failureDomain: [],
    why: "",
    scale: [
      { tier: "1×", note: "" },
      { tier: "10×", note: "" },
      { tier: "100×", note: "" },
    ],
    alts: "",
    x: 0,
    y: 0,
    w: 0,
  },
  {
    id: "gcs_multiregion",
    label: "GCS multi-region",
    sub: "DR",
    zone: "data",
    icon: "",
    cite: 0,
    dataClass: "confidential",
    failureDomain: [],
    why: "",
    scale: [
      { tier: "1×", note: "" },
      { tier: "10×", note: "" },
      { tier: "100×", note: "" },
    ],
    alts: "",
    x: 0,
    y: 0,
    w: 0,
  },
  {
    id: "otel",
    label: "OpenTelemetry",
    sub: "Tracing",
    zone: "app",
    icon: "",
    cite: 0,
    dataClass: "internal",
    failureDomain: [],
    why: "",
    scale: [
      { tier: "1×", note: "" },
      { tier: "10×", note: "" },
      { tier: "100×", note: "" },
    ],
    alts: "",
    x: 0,
    y: 0,
    w: 0,
  },
  {
    id: "sentry",
    label: "Sentry",
    sub: "Errors",
    zone: "app",
    icon: "",
    cite: 0,
    dataClass: "internal",
    failureDomain: [],
    why: "",
    scale: [
      { tier: "1×", note: "" },
      { tier: "10×", note: "" },
      { tier: "100×", note: "" },
    ],
    alts: "",
    x: 0,
    y: 0,
    w: 0,
  },
  {
    id: "armor",
    label: "Cloud Armor (OWASP)",
    sub: "WAF",
    zone: "edge",
    icon: "",
    cite: 0,
    dataClass: "public",
    failureDomain: [],
    why: "",
    scale: [
      { tier: "1×", note: "" },
      { tier: "10×", note: "" },
      { tier: "100×", note: "" },
    ],
    alts: "",
    x: 0,
    y: 0,
    w: 0,
  },
];

export default function DesignSystemView(): React.ReactElement {
  const [sheetOpen, setSheetOpen] = useState(false);
  const [filter, setFilter] = useState<string>("gcp");

  return (
    <main className="mx-auto flex min-h-dvh max-w-5xl flex-col gap-12 p-8">
      <header className="flex items-center justify-between">
        <div className="flex flex-col gap-1">
          <span className="text-primary text-xs font-medium uppercase tracking-wider">
            Phase 0 · Foundations
          </span>
          <h1 className="text-3xl font-semibold tracking-tight">TESSAR design system</h1>
        </div>
        <ThemeToggle />
      </header>

      <section className="flex flex-col gap-3">
        <h2 className="text-on-surface-variant text-sm font-medium">Buttons</h2>
        <div className="flex flex-wrap gap-3">
          <Button variant="filled">Run a brief</Button>
          <Button variant="tonal">Save draft</Button>
          <Button variant="outlined">Cancel</Button>
          <Button variant="text">Learn more</Button>
          <Button variant="elevated">Export</Button>
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-on-surface-variant text-sm font-medium">Icon buttons</h2>
        <div className="flex flex-wrap items-center gap-3">
          <IconButton aria-label="Search" icon="search" variant="standard" />
          <IconButton aria-label="Settings" icon="settings" variant="filled" />
          <IconButton aria-label="Share" icon="share" variant="tonal" />
          <IconButton aria-label="More" icon="more_vert" variant="outlined" />
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-on-surface-variant text-sm font-medium">Filter chips</h2>
        <div className="flex flex-wrap gap-2">
          {[
            { id: "gcp", label: "GCP" },
            { id: "aws", label: "AWS" },
            { id: "azure", label: "Azure" },
            { id: "multi", label: "Multi-cloud" },
          ].map((c) => (
            <Chip
              key={c.id}
              variant="filter"
              selected={filter === c.id}
              onClick={() => setFilter(c.id)}
            >
              {c.label}
            </Chip>
          ))}
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        <Card variant="elevated">
          <CardHeader>
            <CardTitle>Elevated</CardTitle>
            <CardDescription>Default surface for results.</CardDescription>
          </CardHeader>
          <CardBody>The synthesizer agent will write its summary here.</CardBody>
          <CardActions>
            <Button variant="text" size="xs">
              Open
            </Button>
          </CardActions>
        </Card>
        <Card variant="filled">
          <CardHeader>
            <CardTitle>Filled</CardTitle>
            <CardDescription>For grouped content sections.</CardDescription>
          </CardHeader>
          <CardBody>Trade-offs and ADRs go here.</CardBody>
        </Card>
        <Card variant="outlined">
          <CardHeader>
            <CardTitle>Outlined</CardTitle>
            <CardDescription>Lower visual weight.</CardDescription>
          </CardHeader>
          <CardBody>Audit log entries.</CardBody>
        </Card>
      </section>

      <section className="flex max-w-md flex-col gap-3">
        <h2 className="text-on-surface-variant text-sm font-medium">Inputs</h2>
        <Input label="Project name" supporting="What should we call this run?" />
        <Input label="Email" type="email" error="That doesn't look right." />
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-on-surface-variant text-sm font-medium">Wavy progress</h2>
        <WavyProgress ariaLabel="Research in progress" />
        <WavyProgress value={62} ariaLabel="Run progress" />
      </section>

      <section className="flex items-center gap-4">
        <h2 className="text-on-surface-variant text-sm font-medium">FAB &amp; Sheet</h2>
        <Fab icon="add" label="New brief" size="extended" onClick={() => setSheetOpen(true)} />
      </section>

      <Sheet open={sheetOpen} onClose={() => setSheetOpen(false)} ariaLabel="New brief">
        <h3 className="text-xl font-semibold tracking-tight">Start a new brief</h3>
        <p className="text-on-surface-variant mt-1 text-sm">
          Describe your system in plain words. We&apos;ll do the research.
        </p>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="text" onClick={() => setSheetOpen(false)}>
            Cancel
          </Button>
          <Button variant="filled" onClick={() => setSheetOpen(false)}>
            Continue
          </Button>
        </div>
      </Sheet>

      <section className="flex flex-col gap-3">
        <div className="flex flex-col gap-1">
          <h2 className="text-on-surface-variant text-sm font-medium">
            System-design narrative (ADR-0006)
          </h2>
          <p className="text-on-surface-variant text-xs opacity-80">
            Five new sections the architect / synthesizer / packager will emit at MVP launch.
            Rendered here against the SaaS sample fixture so we can iterate on layout before the
            agents populate them for real.
          </p>
        </div>
        <SystemDesignPane
          sequenceDiagrams={SAMPLE_SEQUENCE_DIAGRAMS}
          integrationContracts={SAMPLE_INTEGRATION_CONTRACTS}
          componentRationales={SAMPLE_COMPONENT_RATIONALES}
          failureModes={SAMPLE_FAILURE_MODES}
          buildSequence={SAMPLE_BUILD_SEQUENCE}
          nodes={SHOWCASE_NODES}
        />
      </section>
    </main>
  );
}
