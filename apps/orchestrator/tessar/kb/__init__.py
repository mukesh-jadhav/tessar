"""KB module — orchestrator-side typed access to `kb-seed/`."""

from .loader import get_kb, load_kb
from .types import KbAlternative, KbRecord, KbSource

__all__ = ["KbAlternative", "KbRecord", "KbSource", "get_kb", "load_kb"]
