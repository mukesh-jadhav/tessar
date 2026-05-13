/**
 * Pub/Sub publisher (web → orchestrator handoff).
 *
 * One topic at MVP: `tessar-runs`. A push subscription delivers each
 * message to the orchestrator's `/pubsub/push` endpoint with an OIDC
 * token (in cloud) or no auth (when `PUBSUB_EMULATOR_HOST` is set,
 * which the client library detects automatically).
 *
 * The PubSub client is cached on globalThis so Next.js hot-reload doesn't
 * leak gRPC channels across rebuilds.
 */
import { PubSub } from "@google-cloud/pubsub";

declare global {
  // eslint-disable-next-line no-var
  var __tessarPubSub: PubSub | undefined;
}

function client(): PubSub {
  if (!globalThis.__tessarPubSub) {
    globalThis.__tessarPubSub = new PubSub({
      // In cloud, ADC + GOOGLE_CLOUD_PROJECT are picked up automatically.
      // Locally, PUBSUB_EMULATOR_HOST=localhost:8085 reroutes everything.
      projectId: process.env.GOOGLE_CLOUD_PROJECT ?? "tessar-local",
    });
  }
  return globalThis.__tessarPubSub;
}

const TOPIC = process.env.PUBSUB_RUNS_TOPIC ?? "tessar-runs";

/** Envelope persisted into Pub/Sub. Mirror in `tessar.schemas.RunEnqueued`
 *  on the worker — keep the two in lockstep. */
export interface RunEnqueued {
  runId: string;
  userId: string;
  /** Schema version for the envelope. Bump on breaking changes. */
  v: 1;
}

export async function publishRunEnqueued(msg: RunEnqueued): Promise<string> {
  const data = Buffer.from(JSON.stringify(msg));
  // `attributes` are surfaced as Pub/Sub message attributes; the orchestrator
  // uses `runId` for log correlation without needing to JSON-parse the body.
  return client()
    .topic(TOPIC)
    .publishMessage({
      data,
      attributes: { runId: msg.runId, v: String(msg.v) },
    });
}
