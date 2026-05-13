"""Cloud Storage adapter.

Thin wrapper so the rest of the codebase never imports
``google.cloud.storage`` directly — see the cloud-portability rule in
``.github/instructions/architecture.instructions.md``.

Locally, ``STORAGE_EMULATOR_HOST=http://localhost:4443`` (fake-gcs-server)
is honored by the official client. The bucket must exist before first
write; the emulator init script handles that.
"""

from __future__ import annotations

from functools import lru_cache

from google.auth.credentials import AnonymousCredentials
from google.cloud import storage

from tessar.config import settings


@lru_cache(maxsize=1)
def _client() -> storage.Client:
    # When pointed at fake-gcs-server (or any emulator) we MUST hand the
    # SDK a credentials object — otherwise it tries Application Default
    # Credentials and crashes with `DefaultCredentialsError` on dev boxes
    # that have no gcloud login. `AnonymousCredentials` is the documented
    # escape hatch for emulator use.
    #
    # The SDK does NOT reliably honor `STORAGE_EMULATOR_HOST` in v3+, so
    # we explicitly route the API endpoint via `client_options` too. This
    # branch is dev-only; the cloud branch below is what runs in Cloud Run.
    if settings.storage_emulator_host:
        return storage.Client(
            project=settings.google_cloud_project,
            credentials=AnonymousCredentials(),  # type: ignore[no-untyped-call]
            client_options={"api_endpoint": settings.storage_emulator_host},
        )
    return storage.Client(project=settings.google_cloud_project)


def upload_text(*, key: str, body: str, content_type: str) -> str:
    """Upload UTF-8 text and return the ``gs://`` URI."""
    bucket = _client().bucket(settings.gcs_bucket)
    blob = bucket.blob(key)
    blob.upload_from_string(body, content_type=content_type)
    return f"gs://{settings.gcs_bucket}/{key}"


def upload_bytes(*, key: str, body: bytes, content_type: str) -> str:
    """Upload raw bytes (PDF, PNG, etc.) and return the ``gs://`` URI."""
    bucket = _client().bucket(settings.gcs_bucket)
    blob = bucket.blob(key)
    blob.upload_from_string(body, content_type=content_type)
    return f"gs://{settings.gcs_bucket}/{key}"
