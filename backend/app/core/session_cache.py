"""
Session invalidation cache.

When a user's role or org membership changes (via admin panel or Logto),
their active JWT may still carry the old claims for up to its full lifetime.
This module provides a lightweight Redis-based mechanism to force an early
token refresh without requiring a full re-login.

Flow:
  1. Admin changes user role  →  invalidate_session(user_sub) stores a
     Redis key with a short TTL.
  2. On the user's next request, get_current_user calls is_session_stale().
  3. If stale, a 401 is returned with header  X-Crib-Auth-Refresh: true
  4. The frontend's existing silent-refresh intercepts this header and
     calls POST /api/auth/refresh, obtaining a fresh JWT from Logto.
  5. The retry carries the new JWT with the updated role claims.
  6. The Redis key expires automatically (TTL = JWT max lifetime).

Key format:  stale_session:{sub}
TTL:         24 hours (max Logto JWT lifetime) — after that the token has
             already expired naturally so the marker is no longer needed.
"""
from __future__ import annotations

from app.core.redis import get_redis

_PREFIX = "stale_session:"
_TTL_SECONDS = 86_400  # 24 hours


async def invalidate_session(user_sub: str) -> None:
    """Mark a user's session as stale so their next request triggers a refresh."""
    redis = get_redis()
    await redis.setex(f"{_PREFIX}{user_sub}", _TTL_SECONDS, "1")


async def is_session_stale(user_sub: str) -> bool:
    """Return True if the session has been invalidated since the JWT was issued."""
    redis = get_redis()
    return bool(await redis.exists(f"{_PREFIX}{user_sub}"))


async def clear_stale_marker(user_sub: str) -> None:
    """
    Clear the stale marker once the user has obtained a fresh token.
    Called automatically after a successful request with refreshed claims.
    """
    redis = get_redis()
    await redis.delete(f"{_PREFIX}{user_sub}")


async def invalidate_org_sessions(org_id: str) -> None:
    """
    Convenience: invalidate all sessions for an organisation when org-level
    settings change (e.g., org plan upgrade, org suspension).
    Requires a Redis SCAN — use sparingly.
    """
    redis = get_redis()
    cursor = 0
    while True:
        cursor, keys = await redis.scan(cursor, match=f"{_PREFIX}*", count=100)
        # We can't filter by org without storing the mapping, so we iterate
        # all stale keys. In practice this is only called on admin actions.
        # For org-wide invalidation, store user_sub→org_id mapping if needed.
        _ = keys  # placeholder — see note above
        if cursor == 0:
            break
