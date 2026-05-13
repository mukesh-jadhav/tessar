/**
 * Cloud Storage adapter (web side, read-only).
 *
 * Symmetric with `apps/orchestrator/tessar/storage.py`. Used by the
 * artifact-download route to stream a GCS object back to an authenticated
 * browser. The web app NEVER writes to GCS — that's the worker's job.
 *
 * Local: honors `STORAGE_EMULATOR_HOST=http://127.0.0.1:4443` (fake-gcs-server).
 * Cloud: uses ADC via the Cloud Run service account.
 *
 * Cloud-portability rule: keep all `@google-cloud/storage` imports inside
 * this file. Callers receive a generic `{stream, contentType, contentLength}`.
 */
import "server-only";

import { Readable } from "node:stream";

import { Storage } from "@google-cloud/storage";

let _client: Storage | null = null;

function client(): Storage {
  if (_client) return _client;
  // The Node SDK's auto-detection of STORAGE_EMULATOR_HOST is brittle
  // (it parses the value differently across versions and sometimes ends
  // up requesting `http://storage.googleapis.com` anyway). Pass the
  // emulator endpoint explicitly when present so behavior is deterministic.
  // In cloud, leave STORAGE_EMULATOR_HOST unset and the SDK uses ADC + the
  // real GCS endpoint via the Cloud Run service account.
  const emulator = process.env.STORAGE_EMULATOR_HOST;
  _client = new Storage({
    projectId: process.env.GOOGLE_CLOUD_PROJECT,
    ...(emulator
      ? {
          apiEndpoint: emulator,
          // Tells the SDK we know what we're doing and to skip the
          // "you set a custom endpoint, did you mean to?" auth check.
          useAuthWithCustomEndpoint: false,
        }
      : {}),
  });
  return _client;
}

/** Parse `gs://bucket/key/with/slashes.md` → `{bucket, key}`. */
export function parseGcsUri(uri: string): { bucket: string; key: string } {
  if (!uri.startsWith("gs://")) {
    throw new Error(`not a gs:// URI: ${uri}`);
  }
  const rest = uri.slice("gs://".length);
  const slash = rest.indexOf("/");
  if (slash <= 0 || slash === rest.length - 1) {
    throw new Error(`malformed gs:// URI: ${uri}`);
  }
  return { bucket: rest.slice(0, slash), key: rest.slice(slash + 1) };
}

export interface ObjectStream {
  stream: ReadableStream<Uint8Array>;
  contentType: string;
  contentLength: number | null;
}

/**
 * Open a GCS object for streaming. Throws if the object does not exist.
 *
 * Returns a Web `ReadableStream` (not a Node `Readable`) so it can be
 * passed straight to a `Response` constructor.
 *
 * Two code paths:
 *   - Emulator (`STORAGE_EMULATOR_HOST` set): plain `fetch` against
 *     fake-gcs-server's JSON API. The `@google-cloud/storage` Node SDK
 *     (v7) miscomputes the URL when given a custom endpoint — it builds
 *     `http://localhost:4443:4443/b/{bucket}/o/{key}` (duplicated port,
 *     XML-API path) which fake-gcs returns 404 for. Bypassing the SDK
 *     locally is simpler than fighting it.
 *   - Real GCS: SDK with ADC. In MVP this is the only place that runs
 *     in cloud, so the cloud-portability rule still holds.
 */
export async function openObject(gcsUri: string): Promise<ObjectStream> {
  const { bucket, key } = parseGcsUri(gcsUri);

  const emulator = process.env.STORAGE_EMULATOR_HOST;
  if (emulator) {
    return openObjectViaEmulator(emulator, bucket, key);
  }

  const file = client().bucket(bucket).file(key);

  // Cheap HEAD-equivalent — surfaces 404 before we open a stream and start
  // streaming half a response back to the client.
  const [meta] = await file.getMetadata();
  const contentType =
    typeof meta.contentType === "string" ? meta.contentType : "application/octet-stream";
  const sizeRaw = meta.size;
  const contentLength =
    typeof sizeRaw === "number"
      ? sizeRaw
      : typeof sizeRaw === "string" && sizeRaw !== ""
        ? Number(sizeRaw)
        : null;

  const nodeStream = file.createReadStream();
  // Convert Node Readable → Web ReadableStream so `new Response(stream)`
  // is happy in both Node 20 and Edge runtimes.
  const stream = Readable.toWeb(nodeStream) as unknown as ReadableStream<Uint8Array>;
  return { stream, contentType, contentLength };
}

/**
 * fake-gcs-server adapter. Speaks the JSON API directly:
 *   - Metadata: GET ${endpoint}/storage/v1/b/{bucket}/o/{encodedKey}
 *   - Bytes:    GET ${endpoint}/storage/v1/b/{bucket}/o/{encodedKey}?alt=media
 *
 * Strips a trailing slash from the endpoint to match how it's typically
 * specified in `.env`.
 */
async function openObjectViaEmulator(
  endpoint: string,
  bucket: string,
  key: string,
): Promise<ObjectStream> {
  const base = endpoint.replace(/\/$/, "");
  const objectPath = `/storage/v1/b/${encodeURIComponent(bucket)}/o/${encodeURIComponent(key)}`;

  const metaRes = await fetch(`${base}${objectPath}`);
  if (metaRes.status === 404) {
    throw new Error(`object not found: gs://${bucket}/${key}`);
  }
  if (!metaRes.ok) {
    throw new Error(`fake-gcs metadata ${metaRes.status} for gs://${bucket}/${key}`);
  }
  const meta = (await metaRes.json()) as { contentType?: string; size?: string | number };
  const contentType =
    typeof meta.contentType === "string" ? meta.contentType : "application/octet-stream";
  const contentLength =
    typeof meta.size === "number"
      ? meta.size
      : typeof meta.size === "string" && meta.size !== ""
        ? Number(meta.size)
        : null;

  const dataRes = await fetch(`${base}${objectPath}?alt=media`);
  if (!dataRes.ok || !dataRes.body) {
    throw new Error(`fake-gcs media ${dataRes.status} for gs://${bucket}/${key}`);
  }
  return { stream: dataRes.body, contentType, contentLength };
}
