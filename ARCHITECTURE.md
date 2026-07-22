# Architecture

## Data flow

```text
React upload workspace
        │ multipart/form-data
        ▼
FastAPI validates JPG/PNG magic bytes and size
        │
        ├── JobStore: snapshot + bounded event history
        │                    │
        │                    └── SSE replay/live events ──► React review workspace
        ▼
GLM-OCR service (semaphore = 2, retry 429/5xx)
        │ page Markdown, merged in upload order
        ▼
OpenAI-compatible metadata LLM (validated JSON)
        │
        ▼
User reviews Markdown, title, tags, and topics
        │ explicit export
        ▼
Atomic Obsidian exporter
        ├── OmniScribe/Inbox/*.md
        ├── OmniScribe/Attachments/{job_id}/*
        └── OmniScribe/Topics/*.md
```

## Backend modules

- `main.py`: HTTP contract, upload validation, pipeline orchestration
- `config.py`: environment parsing and demo safety policy
- `models.py`: job/page state and Pydantic request schemas
- `job_store.py`: in-memory jobs, SSE history, replay, heartbeats
- `services/glm_ocr.py`: official Z.AI Layout Parsing REST adapter
- `services/metadata_llm.py`: provider-neutral chat completion adapter
- `services/obsidian.py`: collision-safe, atomic vault export

## API contract

### `POST /api/jobs`

Multipart field `files`, 1–8 JPG/PNG images, maximum 10 MB each. Returns HTTP 202 with `job_id`.

### `GET /api/jobs/{job_id}`

Returns the current snapshot, ordered pages, metadata, Markdown, export result, and `last_event_id`.

### `GET /api/jobs/{job_id}/events?after={event_id}`

SSE events:

- `job.started`
- `page.ocr_started`
- `page.ocr_completed`
- `page.ocr_failed`
- `document.organizing`
- `document.ready`
- `job.failed`
- `export.started`
- `export.completed`
- `export.failed`

Events have monotonic IDs. Historical events are replayed before live events, closing the upload-to-subscribe race.

### `GET /api/jobs/{job_id}/pages/{page_number}/image`

Returns the private source image used by the review workspace.

### `POST /api/jobs/{job_id}/export`

Accepts reviewed Markdown and metadata. Export is idempotent after success.

## State machine

```text
queued → processing → organizing → ready → exporting → exported
                └───────────────────────────────→ error
```

An individual page may fail while the document continues. The job fails only when every page fails or a pipeline-level error occurs.

## Security boundaries

- Provider keys remain in `backend/.env`; the frontend never receives them.
- File content is checked by magic bytes, not filename alone.
- OCR text is untrusted content in the LLM prompt.
- The exporter sanitizes filenames and writes notes atomically.
- Absolute vault paths are not returned to the frontend.
- Demo mode defaults to an isolated demo vault.

