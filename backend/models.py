from dataclasses import dataclass, field
from datetime import datetime, timezone
from enum import Enum
from typing import Any

from pydantic import BaseModel, Field, field_validator


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


class JobStatus(str, Enum):
    QUEUED = "queued"
    PROCESSING = "processing"
    ORGANIZING = "organizing"
    READY = "ready"
    EXPORTING = "exporting"
    EXPORTED = "exported"
    ERROR = "error"


class PageStatus(str, Enum):
    QUEUED = "queued"
    PROCESSING = "processing"
    DONE = "done"
    ERROR = "error"


class DocumentMetadata(BaseModel):
    title: str = Field(min_length=1, max_length=160)
    summary: str = Field(default="", max_length=1000)
    document_type: str = Field(default="notes", max_length=40)
    category: str = Field(default="uncategorized", max_length=80)
    tags: list[str] = Field(default_factory=list, max_length=3)
    topics: list[str] = Field(default_factory=list, max_length=6)

    @field_validator("title", "summary", "document_type", "category")
    @classmethod
    def strip_text(cls, value: str) -> str:
        return value.strip()

    @field_validator("tags", "topics", mode="before")
    @classmethod
    def clean_lists(cls, values: list[str], info) -> list[str]:
        cleaned: list[str] = []
        limit = 3 if info.field_name == "tags" else 6
        source = [values] if isinstance(values, str) else (values or [])
        for value in source:
            item = str(value).strip().lstrip("#")
            if item and item.casefold() not in {existing.casefold() for existing in cleaned}:
                cleaned.append(item[:80])
            if len(cleaned) == limit:
                break
        return cleaned


class ExportRequest(BaseModel):
    markdown: str = Field(min_length=1)
    metadata: DocumentMetadata


class GraphPreviewRequest(BaseModel):
    markdown: str
    metadata: DocumentMetadata
    depth: int = Field(default=1, ge=1, le=2)
    include_tags: bool = True


@dataclass
class Page:
    number: int
    filename: str
    mime_type: str
    content: bytes = field(repr=False)
    status: PageStatus = PageStatus.QUEUED
    markdown: str = ""
    error: str | None = None

    def public_dict(self) -> dict[str, Any]:
        return {
            "number": self.number,
            "filename": self.filename,
            "mime_type": self.mime_type,
            "status": self.status.value,
            "markdown": self.markdown,
            "error": self.error,
        }


@dataclass
class JobEvent:
    id: int
    type: str
    data: dict[str, Any]
    timestamp: datetime = field(default_factory=utc_now)

    def public_dict(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "type": self.type,
            "timestamp": self.timestamp.isoformat(),
            **self.data,
        }


@dataclass
class Job:
    id: str
    pages: list[Page]
    status: JobStatus = JobStatus.QUEUED
    created_at: datetime = field(default_factory=utc_now)
    updated_at: datetime = field(default_factory=utc_now)
    metadata: DocumentMetadata | None = None
    combined_markdown: str = ""
    error: str | None = None
    export_result: dict[str, Any] | None = None
    events: list[JobEvent] = field(default_factory=list)
    next_event_id: int = 1

    @property
    def processed_pages(self) -> int:
        return sum(page.status in {PageStatus.DONE, PageStatus.ERROR} for page in self.pages)

    def snapshot(self) -> dict[str, Any]:
        return {
            "job_id": self.id,
            "status": self.status.value,
            "created_at": self.created_at.isoformat(),
            "updated_at": self.updated_at.isoformat(),
            "processed_pages": self.processed_pages,
            "total_pages": len(self.pages),
            "pages": [page.public_dict() for page in self.pages],
            "metadata": self.metadata.model_dump() if self.metadata else None,
            "combined_markdown": self.combined_markdown,
            "error": self.error,
            "export_result": self.export_result,
            "last_event_id": self.next_event_id - 1,
        }
