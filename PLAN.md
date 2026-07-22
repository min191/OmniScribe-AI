# OmniScribe AI — One-day MVP plan

## Product promise

A local-first web app that turns 1–8 handwritten JPG/PNG pages into one reviewed Markdown note, then writes the note, all source images, tags, and topic links into an Obsidian vault.

## Completed MVP scope

- [x] Multi-image upload with client and server validation
- [x] Image preview, removal, and ordering
- [x] Page-level progressive OCR with bounded concurrency
- [x] Replayable SSE for clients that connect late or reconnect
- [x] Ordered Markdown merge even when pages complete out of order
- [x] LLM title, summary, document type, category, tags, and topics
- [x] Editable Markdown and metadata before export
- [x] GFM tables and KaTeX math preview
- [x] Atomic Obsidian note creation with collision-safe filenames
- [x] All source images saved under one job attachment folder
- [x] Topic stub notes and internal links for Obsidian Graph edges
- [x] Safe demo mode and automated backend flow tests

## Deliberate MVP limits

- Local, single-user, in-memory jobs
- JPG and PNG only; no HEIC/PDF conversion
- Page-level progress, not token-level OCR streaming
- No database, authentication, cloud deployment, or in-app graph renderer
- Job state is lost when the backend restarts
- Real API quality and rate limits require validation with the owner's keys

## Next milestone

1. Run a 12-document handwritten evaluation set: Vietnamese prose, tables, math, mixed layouts, skew, shadows, and multi-page notes.
2. Record OCR accuracy, latency, token usage, and export quality.
3. Add image rotation/cropping only if the evaluation shows it materially improves accuracy.
4. Add SQLite persistence and job cleanup before any hosted deployment.

## Definition of done

- A late SSE subscriber receives prior events.
- Progress never decreases.
- Markdown remains in upload order.
- Invalid files fail before any provider call.
- The user reviews content before export.
- Export creates a note, every attachment, and at least one topic link.
- Demo mode cannot write into a real configured vault without an explicit safety override.

