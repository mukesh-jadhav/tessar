"""Per-run hard cost + token budget.

Used by `LlmRouter` to abort runs that blow past the agreed ceiling.
ADR-0008 sets the dev cap at $0.50 / run; production caps live in
orchestrator config (Phase 4).
"""

from __future__ import annotations

import threading
from dataclasses import dataclass

from .types import LlmUsage


class BudgetExceeded(RuntimeError):
    """Raised by `BudgetTracker.charge()` when a call would push the run
    over its USD or token cap. Caller (the agent graph) must catch this,
    abort the run, refund the user, and emit an alert."""


@dataclass(frozen=True)
class BudgetState:
    """Snapshot of a tracker for logging / SSE events."""

    spent_usd: float
    spent_tokens: int
    cap_usd: float
    cap_tokens: int

    @property
    def remaining_usd(self) -> float:
        return max(0.0, self.cap_usd - self.spent_usd)

    @property
    def remaining_tokens(self) -> int:
        return max(0, self.cap_tokens - self.spent_tokens)


class BudgetTracker:
    """Thread-safe USD + token accumulator for one run.

    The tracker is checked BEFORE each LLM call (using an estimate) and
    again AFTER (using actual usage). Estimating prevents the case where a
    single huge call blows past the cap by 10x.
    """

    def __init__(self, cap_usd: float, cap_tokens: int) -> None:
        if cap_usd <= 0:
            raise ValueError(f"cap_usd must be positive, got {cap_usd}")
        if cap_tokens <= 0:
            raise ValueError(f"cap_tokens must be positive, got {cap_tokens}")
        self._cap_usd = cap_usd
        self._cap_tokens = cap_tokens
        self._spent_usd = 0.0
        self._spent_tokens = 0
        self._lock = threading.Lock()

    def precheck(self, est_cost_usd: float, est_tokens: int) -> None:
        """Raise `BudgetExceeded` if the estimated cost would breach the cap.
        Called before issuing the LLM call."""
        with self._lock:
            if self._spent_usd + est_cost_usd > self._cap_usd:
                raise BudgetExceeded(
                    f"estimated USD spend ${self._spent_usd + est_cost_usd:.4f} "
                    f"would exceed cap ${self._cap_usd:.4f}"
                )
            if self._spent_tokens + est_tokens > self._cap_tokens:
                raise BudgetExceeded(
                    f"estimated token spend {self._spent_tokens + est_tokens} "
                    f"would exceed cap {self._cap_tokens}"
                )

    def charge(self, usage: LlmUsage) -> BudgetState:
        """Record actual spend. Raises `BudgetExceeded` if we are now over
        the cap (the call already happened — caller still gets the response,
        but no further calls are allowed in this run)."""
        with self._lock:
            self._spent_usd += usage.cost_usd
            self._spent_tokens += usage.total_tokens
            state = self._snapshot_locked()
            if self._spent_usd > self._cap_usd:
                raise BudgetExceeded(
                    f"USD spend ${self._spent_usd:.4f} exceeds cap ${self._cap_usd:.4f}"
                )
            if self._spent_tokens > self._cap_tokens:
                raise BudgetExceeded(
                    f"token spend {self._spent_tokens} exceeds cap {self._cap_tokens}"
                )
            return state

    def state(self) -> BudgetState:
        with self._lock:
            return self._snapshot_locked()

    def _snapshot_locked(self) -> BudgetState:
        return BudgetState(
            spent_usd=self._spent_usd,
            spent_tokens=self._spent_tokens,
            cap_usd=self._cap_usd,
            cap_tokens=self._cap_tokens,
        )
