"""SQLAlchemy async engine + session factory.

Connection string is built from individual env vars so we never log a
full DSN with the password. The DB password is fetched from Secret Manager
in production (see ``tessar.config``); locally it comes from
``DATABASE_PASSWORD`` in the dev ``.env``.
"""

from __future__ import annotations

from functools import lru_cache
from typing import TYPE_CHECKING

from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)

if TYPE_CHECKING:
    from collections.abc import Callable


def _build_dsn(
    *,
    host: str,
    port: int,
    user: str,
    password: str,
    database: str,
) -> str:
    # asyncpg driver. Password is URL-quoted by SQLAlchemy when using URL
    # objects, but for simple cases this is fine — passwords from Secret
    # Manager are random base64 (no '@' or '/').
    return f"postgresql+asyncpg://{user}:{password}@{host}:{port}/{database}"


@lru_cache(maxsize=1)
def get_engine(
    *,
    host: str,
    port: int = 5432,
    user: str = "tessar_app",
    password: str,
    database: str = "tessar",
    echo: bool = False,
) -> AsyncEngine:
    return create_async_engine(
        _build_dsn(host=host, port=port, user=user, password=password, database=database),
        echo=echo,
        pool_size=5,
        max_overflow=5,
        pool_pre_ping=True,
        # Cloud SQL drops idle conns at 600s; recycle well before that.
        pool_recycle=300,
    )


def get_sessionmaker(engine: AsyncEngine) -> Callable[[], AsyncSession]:
    return async_sessionmaker(
        engine,
        expire_on_commit=False,
        class_=AsyncSession,
    )
