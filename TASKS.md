# Task status

## Implemented

- [x] Remove credentials from `.env.example` and ignore local secrets
- [x] Initialize Git repository
- [x] Add Windows setup script
- [x] Replace JSON base64 upload with multipart files
- [x] Validate count, size, and JPG/PNG signatures
- [x] Add page states, job snapshots, event IDs, SSE replay, and heartbeats
- [x] Add bounded GLM-OCR adapter and deterministic demo provider
- [x] Add configurable LLM adapter, JSON validation, and prompt-injection boundary
- [x] Split review and export operations
- [x] Add atomic Obsidian note export, all images, and topic links
- [x] Replace Vite starter with upload and review workspaces
- [x] Add responsive layout, keyboard focus, reduced motion, GFM, and KaTeX fallback
- [x] Add backend unit/integration tests
- [x] Pass Python compile, frontend lint, and production build
- [x] Complete browser screenshot QA for upload and review screens

## Owner actions required

- [ ] Rotate the Z.AI and legacy LLM keys that were previously stored in `.env.example`
- [ ] Migrate `backend/.env` from legacy `ANTHROPIC_*` variables to `LLM_*`
- [ ] Set `DEMO_MODE=false` only after the new credentials are ready
- [ ] Run the real handwritten evaluation corpus

## Post-MVP backlog

- [ ] SQLite job persistence and TTL cleanup
- [ ] HEIC/PDF conversion
- [ ] Crop, rotate, and image-quality guidance
- [ ] Retry controls for one failed page
- [ ] OCR region highlighting from `layout_details`
- [ ] Hosted deployment, authentication, quotas, and privacy controls

