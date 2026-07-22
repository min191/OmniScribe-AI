from dataclasses import dataclass
from pathlib import Path
import os


def _as_bool(value: str | None, default: bool = False) -> bool:
    if value is None:
        return default
    return value.strip().lower() in {"1", "true", "yes", "on"}


@dataclass(frozen=True)
class Settings:
    z_ai_api_key: str
    z_ai_base_url: str
    llm_api_key: str
    llm_base_url: str
    llm_model: str
    vault_path: Path
    demo_mode: bool
    ocr_concurrency: int
    max_upload_files: int
    max_image_bytes: int
    cors_origins: tuple[str, ...]
    vault_graph_roots: tuple[str, ...] = ("OmniScribe",)
    vault_graph_max_nodes: int = 80

    @classmethod
    def from_env(cls) -> "Settings":
        backend_dir = Path(__file__).resolve().parent
        demo_mode = _as_bool(os.getenv("DEMO_MODE"), default=True)
        allow_demo_vault_write = _as_bool(os.getenv("DEMO_ALLOW_VAULT_WRITE"), default=False)
        raw_vault = os.getenv("VAULT_PATH", "").strip()
        if demo_mode and not allow_demo_vault_write:
            vault_path = backend_dir / "demo-vault"
        else:
            vault_path = Path(raw_vault).expanduser() if raw_vault else backend_dir / "demo-vault"
        origins = tuple(
            origin.strip()
            for origin in os.getenv("CORS_ORIGINS", "http://localhost:5173").split(",")
            if origin.strip()
        )
        graph_roots = tuple(
            item.strip().replace("\\", "/").strip("/") or "."
            for item in os.getenv("VAULT_GRAPH_ROOTS", "OmniScribe").split(",")
            if item.strip()
        ) or ("OmniScribe",)

        return cls(
            z_ai_api_key=os.getenv("Z_AI_API_KEY", "").strip(),
            z_ai_base_url=os.getenv("Z_AI_BASE_URL", "https://api.z.ai/api/paas/v4").rstrip("/"),
            llm_api_key=os.getenv("LLM_API_KEY", "").strip(),
            llm_base_url=os.getenv("LLM_BASE_URL", "https://api.z.ai/api/paas/v4").rstrip("/"),
            llm_model=os.getenv("LLM_MODEL", "glm-4.7-flash").strip(),
            vault_path=vault_path.resolve(),
            demo_mode=demo_mode,
            ocr_concurrency=max(1, min(int(os.getenv("OCR_CONCURRENCY", "2")), 4)),
            max_upload_files=max(1, min(int(os.getenv("MAX_UPLOAD_FILES", "8")), 20)),
            max_image_bytes=max(1024, int(os.getenv("MAX_IMAGE_BYTES", "10485760"))),
            cors_origins=origins,
            vault_graph_roots=graph_roots,
            vault_graph_max_nodes=max(8, min(int(os.getenv("VAULT_GRAPH_MAX_NODES", "80")), 250)),
        )
