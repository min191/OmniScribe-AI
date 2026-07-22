# Risks and mitigations

## Credentials were exposed

The original `.env.example` contained non-placeholder provider credentials. They have been removed from the workspace and local `.env` files are ignored, but only provider-side rotation invalidates exposed keys.

## OCR is progressive by page, not token

The Z.AI Layout Parsing endpoint returns a complete `md_results` response per request. OmniScribe streams page and pipeline events; it does not claim model token streaming.

## Handwriting quality is not yet measured

The repository sample is machine-generated text. Real Vietnamese handwriting, tables, math, skew, shadows, and camera blur must be evaluated before accuracy claims are made.

## In-memory jobs are ephemeral

Restarting FastAPI loses job state. This is acceptable for a local one-day MVP; use SQLite before production.

## Provider compatibility varies

The metadata client expects an OpenAI-compatible chat-completion endpoint with JSON mode. Unsupported providers fall back to safe generic metadata rather than blocking export.

## Vault conflicts and privacy

Notes use collision-safe names and atomic replacement, but the app still sends document content to external OCR/LLM providers. Users must not upload sensitive material without accepting those providers' policies.

## HTML tables

The preview intentionally does not render raw HTML from OCR because it is untrusted. GFM tables render normally; HTML remains visible as text until a sanitized conversion layer is added.

