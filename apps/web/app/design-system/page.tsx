"use client";

import { useState } from "react";

import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import { Card, CardActions, CardBody, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Chip } from "@/components/ui/chip";
import { Fab } from "@/components/ui/fab";
import { IconButton } from "@/components/ui/icon-button";
import { Input } from "@/components/ui/input";
import { Sheet } from "@/components/ui/sheet";
import { WavyProgress } from "@/components/ui/wavy-progress";

export default function HomePage(): React.ReactElement {
  const [sheetOpen, setSheetOpen] = useState(false);
  const [filter, setFilter] = useState<string>("gcp");

  return (
    <main className="mx-auto flex min-h-dvh max-w-5xl flex-col gap-12 p-8">
      <header className="flex items-center justify-between">
        <div className="flex flex-col gap-1">
          <span className="text-xs font-medium uppercase tracking-wider text-primary">
            Phase 0 · Foundations
          </span>
          <h1 className="text-3xl font-semibold tracking-tight">TESSAR design system</h1>
        </div>
        <ThemeToggle />
      </header>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-medium text-on-surface-variant">Buttons</h2>
        <div className="flex flex-wrap gap-3">
          <Button variant="filled">Run a brief</Button>
          <Button variant="tonal">Save draft</Button>
          <Button variant="outlined">Cancel</Button>
          <Button variant="text">Learn more</Button>
          <Button variant="elevated">Export</Button>
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-medium text-on-surface-variant">Icon buttons</h2>
        <div className="flex flex-wrap items-center gap-3">
          <IconButton aria-label="Search" icon="search" variant="standard" />
          <IconButton aria-label="Settings" icon="settings" variant="filled" />
          <IconButton aria-label="Share" icon="share" variant="tonal" />
          <IconButton aria-label="More" icon="more_vert" variant="outlined" />
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-medium text-on-surface-variant">Filter chips</h2>
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
        <h2 className="text-sm font-medium text-on-surface-variant">Inputs</h2>
        <Input label="Project name" supporting="What should we call this run?" />
        <Input label="Email" type="email" error="That doesn't look right." />
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-medium text-on-surface-variant">Wavy progress</h2>
        <WavyProgress ariaLabel="Research in progress" />
        <WavyProgress value={62} ariaLabel="Run progress" />
      </section>

      <section className="flex items-center gap-4">
        <h2 className="text-sm font-medium text-on-surface-variant">FAB &amp; Sheet</h2>
        <Fab icon="add" label="New brief" size="extended" onClick={() => setSheetOpen(true)} />
      </section>

      <Sheet open={sheetOpen} onClose={() => setSheetOpen(false)} ariaLabel="New brief">
        <h3 className="text-xl font-semibold tracking-tight">Start a new brief</h3>
        <p className="mt-1 text-sm text-on-surface-variant">
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
    </main>
  );
}
