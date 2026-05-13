"""Initialise the local Pub/Sub emulator + fake-gcs bucket.

Run this **once** after ``docker compose up`` (and re-run safely — both
operations are idempotent). It creates:

    • Pub/Sub topic        ``tessar-runs`` (+ DLQ ``tessar-runs-dlq``)
    • Push subscription    ``tessar-runs-push`` → ``http://host.docker.internal:8000/pubsub/push``
    • GCS bucket           ``tessar-artifacts-local``

The push endpoint host (``host.docker.internal``) lets the Pub/Sub
emulator container reach the orchestrator running on the host. On Linux
hosts you may need ``--add-host=host.docker.internal:host-gateway`` on
the pubsub service (Docker Desktop wires this automatically).

Usage:
    PUBSUB_EMULATOR_HOST=localhost:8085 \\
    STORAGE_EMULATOR_HOST=http://localhost:4443 \\
    GOOGLE_CLOUD_PROJECT=tessar-local \\
    python apps/orchestrator/scripts/init_local_emulators.py
"""

from __future__ import annotations

import os
import sys

from google.api_core.exceptions import AlreadyExists, Conflict
from google.cloud import pubsub_v1, storage

PROJECT = os.environ.get("GOOGLE_CLOUD_PROJECT", "tessar-local")
TOPIC = os.environ.get("PUBSUB_RUNS_TOPIC", "tessar-runs")
DLQ_TOPIC = f"{TOPIC}-dlq"
SUBSCRIPTION = f"{TOPIC}-push"
PUSH_ENDPOINT = os.environ.get("PUSH_ENDPOINT", "http://host.docker.internal:8000/pubsub/push")
BUCKET = os.environ.get("GCS_BUCKET", "tessar-artifacts-local")
GCS_EMULATOR = os.environ.get("STORAGE_EMULATOR_HOST", "http://localhost:4443")


def _ensure_topic(client: pubsub_v1.PublisherClient, name: str) -> str:
    path = client.topic_path(PROJECT, name)
    try:
        client.create_topic(name=path)
        print(f"  ✓ created topic {name}")
    except AlreadyExists:
        print(f"  · topic {name} already exists")
    return path


def init_pubsub() -> None:
    if not os.environ.get("PUBSUB_EMULATOR_HOST"):
        print("PUBSUB_EMULATOR_HOST not set; refusing to touch real Pub/Sub.")
        sys.exit(2)

    print(f"Pub/Sub @ {os.environ['PUBSUB_EMULATOR_HOST']} (project={PROJECT})")
    publisher = pubsub_v1.PublisherClient()
    subscriber = pubsub_v1.SubscriberClient()

    topic_path = _ensure_topic(publisher, TOPIC)
    dlq_path = _ensure_topic(publisher, DLQ_TOPIC)

    sub_path = subscriber.subscription_path(PROJECT, SUBSCRIPTION)
    push_config = pubsub_v1.types.PushConfig(push_endpoint=PUSH_ENDPOINT)
    # The Pub/Sub emulator doesn't honor DeadLetterPolicy, but the real
    # service does — keep the policy for cloud and skip it locally.
    use_dlq = not bool(os.environ.get("PUBSUB_EMULATOR_HOST"))
    sub_request = pubsub_v1.types.Subscription(
        name=sub_path,
        topic=topic_path,
        push_config=push_config,
        ack_deadline_seconds=600,
    )
    if use_dlq:
        sub_request.dead_letter_policy = pubsub_v1.types.DeadLetterPolicy(
            dead_letter_topic=dlq_path,
            max_delivery_attempts=5,
        )
    try:
        subscriber.create_subscription(request=sub_request)
        print(f"  ✓ created push subscription {SUBSCRIPTION} → {PUSH_ENDPOINT}")
    except AlreadyExists:
        # Update the push endpoint in case it changed.
        subscriber.modify_push_config(subscription=sub_path, push_config=push_config)
        print(f"  · subscription {SUBSCRIPTION} already exists (push endpoint refreshed)")


def init_gcs() -> None:
    print(f"GCS @ {GCS_EMULATOR} (bucket={BUCKET})")
    client = storage.Client(project=PROJECT)
    try:
        client.create_bucket(BUCKET)
        print(f"  ✓ bucket {BUCKET} created")
    except Conflict:
        print(f"  · bucket {BUCKET} already exists")
    except Exception as exc:
        print(f"  ✗ failed to create bucket: {exc}")
        sys.exit(1)


def main() -> None:
    init_pubsub()
    init_gcs()
    print("\nDone. Start the orchestrator and POST a brief from the web app.")


if __name__ == "__main__":
    main()
