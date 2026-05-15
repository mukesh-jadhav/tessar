/**
 * /run/[id]/package — In-app viewer for the finished design package.
 *
 * Server Component. Pulls the run row, loads the `package_json` artifact
 * straight from object storage (re-using the same auth + storage adapter
 * as `/api/runs/[id]/artifact/[kind]`), and hands the parsed RunPackage
 * to a client renderer for the actual sectioned UI.
 *
 * Auth model:
 *   - Must be signed in (Auth.js session)
 *   - Caller must own the run
 *   - Run must be in a state where the package exists (`succeeded` or
 *     a future `archived`); otherwise we 404 the user back to /run/[id]
 *     where they can watch progress.
 */
import { notFound, redirect } from "next/navigation";

import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { openObject } from "@/lib/storage";
import { PackageView } from "@/components/package/package-view";
import type { RunPackage } from "@/lib/run-package";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function RunPackagePage({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<React.ReactElement> {
  const { id } = await params;

  const session = await auth();
  if (!session?.user?.id) {
    redirect(`/signin?from=${encodeURIComponent(`/run/${id}/package`)}`);
  }

  const run = await prisma.run.findUnique({
    where: { id },
    select: {
      id: true,
      userId: true,
      status: true,
      briefJson: true,
      createdAt: true,
      completedAt: true,
      artifacts: {
        select: { kind: true, gcsUri: true, mime: true },
      },
    },
  });
  if (!run) notFound();
  if (run.userId !== session.user.id) notFound();

  const pkgArtifact = run.artifacts.find((a) => a.kind === "package_json");
  // If the run hasn't produced the structured package yet, send the user
  // back to the live progress page — they can come back when it's ready.
  if (!pkgArtifact) redirect(`/run/${id}`);

  let pkg: RunPackage;
  try {
    const obj = await openObject(pkgArtifact.gcsUri);
    const buf = await streamToBuffer(obj.stream);
    pkg = JSON.parse(buf.toString("utf-8")) as RunPackage;
  } catch (err) {
    console.error("[run/package] failed to load package_json", { id, err });
    throw new Error("Could not load the design package. Please try again.");
  }

  const hasMd = run.artifacts.some((a) => a.kind === "package_md");
  const hasPdf = run.artifacts.some((a) => a.kind === "package_pdf");

  return (
    <PackageView
      runId={id}
      pkg={pkg}
      hasMd={hasMd}
      hasPdf={hasPdf}
      completedAt={run.completedAt?.toISOString() ?? null}
    />
  );
}

async function streamToBuffer(
  stream: NodeJS.ReadableStream | ReadableStream<Uint8Array>,
): Promise<Buffer> {
  // Both Node and Web ReadableStream show up here depending on which
  // backend `openObject` used (real GCS uses Node streams; the local
  // emulator path returns a Web ReadableStream).
  const chunks: Buffer[] = [];
  if (Symbol.asyncIterator in stream) {
    for await (const chunk of stream as NodeJS.ReadableStream) {
      chunks.push(
        typeof chunk === "string" ? Buffer.from(chunk) : Buffer.from(chunk as Uint8Array),
      );
    }
    return Buffer.concat(chunks);
  }
  const reader = (stream as ReadableStream<Uint8Array>).getReader();
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) chunks.push(Buffer.from(value));
  }
  return Buffer.concat(chunks);
}
