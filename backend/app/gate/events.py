"""In-process pub/sub for WS /api/events. Visualisation only: never in the decision path,
so a slow or missing subscriber can't block or change a decision (fail-open by design)."""

import asyncio

_subscribers: set[asyncio.Queue] = set()


def subscribe() -> asyncio.Queue:
    q: asyncio.Queue = asyncio.Queue(maxsize=1000)
    _subscribers.add(q)
    return q


def unsubscribe(q: asyncio.Queue) -> None:
    _subscribers.discard(q)


def publish(events: list[dict]) -> None:
    for q in list(_subscribers):
        for e in events:
            try:
                q.put_nowait(e)
            except asyncio.QueueFull:
                pass  # drop for that viewer rather than slow the gate
