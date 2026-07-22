from __future__ import annotations

import argparse
from datetime import datetime, timezone
from pathlib import Path
import shutil
import sys

import yaml

BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from services.obsidian import _atomic_write, _safe_topic, ensure_category_note, omniscribe_content_root  # noqa: E402


def add_category_section(text: str, category: str, category_target: str | None = None) -> str:
    category_name = _safe_topic(category)
    target = category_target or f"OmniScribe/Categories/{category_name}"
    link = f"[[{target}|{category}]]"
    if link in text or "## Danh mục" in text:
        return text
    return f"{text.rstrip()}\n\n## Danh mục\n\n{link}\n"


def frontmatter(text: str) -> dict:
    if not text.startswith("---"):
        return {}
    parts = text.split("---", 2)
    if len(parts) < 3:
        return {}
    loaded = yaml.safe_load(parts[1]) or {}
    return loaded if isinstance(loaded, dict) else {}


def migrate(vault: Path, apply: bool = False, timestamp: str | None = None) -> dict[str, object]:
    vault = vault.resolve()
    content_root = omniscribe_content_root(vault)
    inbox = content_root / "Inbox"
    stamp = timestamp or datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    backup_root = content_root / ".omniscribe-backups" / stamp
    changed: list[str] = []
    categories: set[str] = set()
    if not inbox.is_dir():
        return {"changed": changed, "categories": [], "applied": apply}
    for path in sorted(inbox.rglob("*.md")):
        if path.is_symlink():
            continue
        text = path.read_text(encoding="utf-8")
        metadata = frontmatter(text)
        category = metadata.get("category")
        if metadata.get("source") != "handwritten" or not isinstance(category, str) or not category.strip():
            continue
        category = category.strip()
        categories.add(category)
        category_target = (content_root / "Categories" / _safe_topic(category)).relative_to(vault).as_posix()
        updated = add_category_section(text, category, category_target)
        if updated == text:
            continue
        relative = path.relative_to(vault).as_posix()
        changed.append(relative)
        if apply:
            backup_path = backup_root / path.relative_to(vault)
            backup_path.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(path, backup_path)
            _atomic_write(path, updated)
    if apply:
        for category in sorted(categories, key=str.casefold):
            ensure_category_note(vault, category)
    return {"changed": changed, "categories": sorted(categories, key=str.casefold), "applied": apply}


def main() -> int:
    parser = argparse.ArgumentParser(description="Thêm wikilink Danh mục cho note OmniScribe cũ.")
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument("--dry-run", action="store_true", help="Chỉ liệt kê file sẽ thay đổi.")
    mode.add_argument("--apply", action="store_true", help="Sao lưu rồi cập nhật file.")
    parser.add_argument("--vault", type=Path, help="Vault path; mặc định đọc VAULT_PATH/config.")
    args = parser.parse_args()
    if args.vault:
        vault = args.vault
    else:
        from config import Settings
        vault = Settings.from_env().vault_path
    result = migrate(vault, apply=args.apply)
    action = "Updated" if args.apply else "Would update"
    print(f"{action} {len(result['changed'])} note(s); {len(result['categories'])} category note(s).")
    for path in result["changed"]:
        print(f"- {path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
