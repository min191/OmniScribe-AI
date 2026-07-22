import asyncio
import json
from collections.abc import AsyncGenerator
from datetime import datetime
from typing import Any

from models import Job, JobEvent, JobStatus, utc_now


TERMINAL_STATUSES = {JobStatus.EXPORTED, JobStatus.ERROR}


class JobStore:
    def __init__(self) -> None:
        self.jobs: dict[str, Job] = {}
        self.subscribers: dict[str, list[asyncio.Queue[JobEvent]]] = {}
        self.lock = asyncio.Lock()

    async def add(self, job: Job) -> None:
        async with self.lock:
            self.jobs[job.id] = job
            self.subscribers[job.id] = []

    async def get(self, job_id: str) -> Job | None:
        async with self.lock:
            return self.jobs.get(job_id)

    async def emit(self, job_id: str, event_type: str, **data: Any) -> JobEvent:
        async with self.lock:
            job = self.jobs[job_id]
            job.updated_at = utc_now()
            event = JobEvent(id=job.next_event_id, type=event_type, data=data)
            job.next_event_id += 1
            job.events.append(event)
            job.events = job.events[-500:]
            queues = list(self.subscribers.get(job_id, []))

        for queue in queues:
            queue.put_nowait(event)
        return event

    async def stream(self, job_id: str, after_id: int = 0) -> AsyncGenerator[str, None]:
        queue: asyncio.Queue[JobEvent] = asyncio.Queue()
        async with self.lock:
            job = self.jobs[job_id]
            replay = [event for event in job.events if event.id > after_id]
            self.subscribers[job_id].append(queue)
            terminal_before_subscribe = job.status in TERMINAL_STATUSES

        try:
            for event in replay:
                yield self._format(event)

            if terminal_before_subscribe:
                return

            while True:
                try:
                    event = await asyncio.wait_for(queue.get(), timeout=15)
                except TimeoutError:
                    yield f": heartbeat {datetime.now().isoformat()}\n\n"
                    continue

                yield self._format(event)
                if event.type in {"job.failed", "export.completed"}:
                    return
        finally:
            async with self.lock:
                subscribers = self.subscribers.get(job_id, [])
                if queue in subscribers:
                    subscribers.remove(queue)

    @staticmethod
    def _format(event: JobEvent) -> str:
        payload = json.dumps(event.public_dict(), ensure_ascii=False)
        return f"id: {event.id}\ndata: {payload}\n\n"


job_store = JobStore()

