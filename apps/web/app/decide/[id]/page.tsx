/**
 * /decide/[id] — The post-run reader for a finished package.
 *
 * Server Component. Loads the run, ownership-checks it, fetches the
 * `package_json` artifact from object storage, and renders the
 * five-section <DecideViewer />: Verdict → Decisions → Numbers →
 * Risks → Audit.
 *
 * The canned /decide demo (sales surface) still uses the older
 * DecideStudio prototype; this page is the consumer-grade deliverable
 * for real runs.
 *
 * Auth model:
 *   - Must be signed in (Auth.js session)
 *   - Caller must own the run
 *   - Run must have produced a structured package; otherwise we send
 *     the user back to /run/[id] where they can watch progress.
 */
import { notFound, redirect } from "next/navigation";

import { auth } from "@/auth";
import { DecideViewer } from "@/components/decide/decide-viewer";
import { prisma } from "@/lib/db";
import type { RunPackage } from "@/lib/run-package";
import { openObject } from "@/lib/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function DecideRunPage({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<React.ReactElement> {
  const { id } = await params;

  const session = await auth();
  if (!session?.user?.id) {
    redirect(`/signin?from=${encodeURIComponent(`/decide/${id}`)}`);
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
  // Package not ready yet — bounce back to the live progress page so the
  // user can watch the run finish; they can return when it's done.
  if (!pkgArtifact) redirect(`/run/${id}`);

  let pkg: RunPackage;
  try {
    const obj = await openObject(pkgArtifact.gcsUri);
    const buf = await streamToBuffer(obj.stream);
    pkg = JSON.parse(buf.toString("utf-8")) as RunPackage;
  } catch (err) {
    console.error("[decide/id] failed to load package_json", { id, err });
    throw new Error("Could not load the design package. Please try again.");
  }

  const hasMd = run.artifacts.some((a) => a.kind === "package_md");
  const hasPdf = run.artifacts.some((a) => a.kind === "package_pdf");

  return (
    <DecideViewer
      runId={id}
      pkg={pkg}
      hasMd={hasMd}
      hasPdf={hasPdf}
      completedAt={run.completedAt ? run.completedAt.toISOString() : null}
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
