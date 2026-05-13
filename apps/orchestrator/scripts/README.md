# orchestrator scripts

One-shot scripts not part of the runtime image.

| Script                  | Purpose                                                                                                                                    | Phase |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ | ----- |
| `check_schema_drift.py` | Compare SQLAlchemy mirror in `tessar.db.models` against a live Postgres schema. Run in CI after `prisma migrate deploy` to a throwaway DB. | 2     |

Run locally (against `infra/docker-compose.yml` Postgres):

```powershell
$env:DATABASE_URL = "postgresql+asyncpg://tessar:tessar@localhost:5432/tessar"
uv run python -m scripts.check_schema_drift
```
