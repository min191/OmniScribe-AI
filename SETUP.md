# Setup

## Requirements

- Python 3.11+
- Node.js 20+
- Optional: an Obsidian desktop vault

## 1. Backend

```powershell
Copy-Item .env.example backend\.env
cd backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
python -m uvicorn main:app --reload --port 8000
```

API docs are available at `http://localhost:8000/docs`.

## 2. Frontend

```powershell
cd frontend
npm install
npm run dev
```

Open `http://localhost:5173`.

## Configuration

`backend/.env`:

```env
Z_AI_API_KEY=
Z_AI_BASE_URL=https://api.z.ai/api/paas/v4

LLM_API_KEY=
LLM_BASE_URL=https://api.z.ai/api/paas/v4
LLM_MODEL=glm-4.7-flash

VAULT_PATH=D:\Notes\My Vault

DEMO_MODE=true
DEMO_ALLOW_VAULT_WRITE=false
OCR_CONCURRENCY=2
MAX_UPLOAD_FILES=8
MAX_IMAGE_BYTES=10485760
CORS_ORIGINS=http://localhost:5173
```

### Demo safety

When `DEMO_MODE=true`, OCR and metadata are generated locally. Output always goes to `backend/demo-vault/`, even when a real `VAULT_PATH` is present. Set `DEMO_ALLOW_VAULT_WRITE=true` only if demo output should enter the configured vault.

### Real APIs

Set `DEMO_MODE=false`. GLM-OCR calls `POST /layout_parsing` with `model=glm-ocr`. Metadata calls the configured OpenAI-compatible `POST /chat/completions` endpoint with JSON mode.

Older variables such as `ANTHROPIC_API_KEY` are no longer used. Replace them with the `LLM_*` variables above.

## Troubleshooting

- `415`: the file is not a valid JPG/PNG; renaming an unsupported file does not bypass validation.
- `413`: an image exceeds 10 MB.
- Frontend says backend offline: confirm port 8000 and `CORS_ORIGINS`.
- Obsidian export fails: verify `VAULT_PATH` is absolute and writable.
- PowerShell blocks `npm.ps1`: use `npm.cmd run dev`.

