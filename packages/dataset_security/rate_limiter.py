"""
In-memory sliding-window rate limiter for API protection and abuse controls.
"""
import threading
import time
from collections import defaultdict, deque

from packages.dataset_core.exceptions import RateLimitExceededError


class RateLimiter:
    """Thread-safe sliding-window rate limiter."""

    def __init__(self):
        self._lock = threading.Lock()
        self._history: dict[str, deque[float]] = defaultdict(deque)

    def check(self, key: str, max_requests: int, window_seconds: int = 60) -> None:
        """
        Check if key has exceeded max_requests in the rolling window_seconds.
        Raises RateLimitExceededError if rate limit is exceeded.
        """
        now = time.time()
        cutoff = now - window_seconds

        with self._lock:
            queue = self._history[key]
            # Prune old events outside the rolling window
            while queue and queue[0] < cutoff:
                queue.popleft()

            if len(queue) >= max_requests:
                oldest = queue[0]
                retry_after = max(1, int(oldest + window_seconds - now))
                raise RateLimitExceededError(
                    retry_after=retry_after,
                    message=f"Rate limit exceeded ({max_requests} req / {window_seconds}s). Retry in {retry_after}s.",
                )

            queue.append(now)

    def reset(self, key: str | None = None) -> None:
        """Reset history for a specific key or all keys (useful for test isolation)."""
        with self._lock:
            if key:
                self._history.pop(key, None)
            else:
                self._history.clear()


# Global shared rate limiter instance
global_rate_limiter = RateLimiter()
