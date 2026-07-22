from datetime import datetime, timezone
import os
from pathlib import Path
import re
import unicodedata
from urllib.parse import quote

import yaml

from config import Settings
from models import DocumentMetadata, Page


WINDOWS_RESERVED = {"con", "prn", "aux", "nul", *(f"com{i}" for i in range(1, 10)), *(f"lpt{i}" for i in range(1, 10))}


def obsidian_open_uri(vault_name: str, relative_note: str) -> str:
    return f"obsidian://open?vault={quote(vault_name, safe='')}&file={quote(relative_note, safe='')}"


def omniscribe_content_root(vault_root: Path) -> Path:
    if vault_root.name.casefold() == "omniscribe":
        return vault_root
    return vault_root / "OmniScribe"


def omniscribe_relative_path(vault_root: Path, *parts: str) -> str:
    return omniscribe_content_root(vault_root).joinpath(*parts).relative_to(vault_root).as_posix()


def slugify(value: str, fallback: str = "ghi-chu") -> str:
    normalized = unicodedata.normalize("NFKD", value)
    ascii_text = normalized.encode("ascii", "ignore").decode("ascii").lower()
    slug = re.sub(r"[^a-z0-9]+", "-", ascii_text).strip("-._ ")
    if not slug or slug in WINDOWS_RESERVED:
        return fallback
    return slug[:100]


def _safe_topic(value: str) -> str:
    cleaned = re.sub(r'[<>:"/\\|?*]', "-", value).strip(" .")
    return cleaned[:100] or "Chủ đề"


def ensure_category_note(root: Path, category: str) -> tuple[Path, str]:
    category_name = _safe_topic(category or "Chưa phân loại")
    category_path = omniscribe_content_root(root) / "Categories" / f"{category_name}.md"
    category_path.parent.mkdir(parents=True, exist_ok=True)
    if not category_path.exists():
        frontmatter = yaml.safe_dump(
            {"type": "category", "category": category},
            allow_unicode=True,
            sort_keys=False,
        ).strip()
        _atomic_write(category_path, f"---\n{frontmatter}\n---\n\n# {category_name}\n")
    return category_path, category_name


def _atomic_write(path: Path, content: str) -> None:
    temp_path = path.with_suffix(path.suffix + ".tmp")
    temp_path.write_text(content, encoding="utf-8")
    os.replace(temp_path, path)


class ObsidianExporter:
    def __init__(self, settings: Settings) -> None:
        self.settings = settings

    def export(
        self,
        job_id: str,
        pages: list[Page],
        markdown: str,
        metadata: DocumentMetadata,
    ) -> dict[str, str | bool]:
        root = self.settings.vault_path
        content_root = omniscribe_content_root(root)
        inbox = content_root / "Inbox"
        attachments = content_root / "Attachments" / job_id
        topics_dir = content_root / "Topics"
        categories_dir = content_root / "Categories"
        for directory in (inbox, attachments, topics_dir, categories_dir):
            directory.mkdir(parents=True, exist_ok=True)

        category_path, category_name = ensure_category_note(root, metadata.category)
        category_target = category_path.relative_to(root).with_suffix("").as_posix()

        timestamp = datetime.now(timezone.utc)
        base_name = f"{timestamp:%Y-%m-%d}-{slugify(metadata.title)}"
        note_path = self._unique_path(inbox / f"{base_name}.md")

        attachment_links: list[str] = []
        for page in pages:
            extension = ".png" if page.mime_type == "image/png" else ".jpg"
            image_path = attachments / f"page-{page.number:02d}{extension}"
            image_path.write_bytes(page.content)
            relative_image = image_path.relative_to(root).as_posix()
            attachment_links.append(f"![[{relative_image}]]")

        topic_links: list[str] = []
        for topic in metadata.topics:
            topic_name = _safe_topic(topic)
            topic_path = topics_dir / f"{topic_name}.md"
            if not topic_path.exists():
                topic_frontmatter = yaml.safe_dump({"type": "topic", "topic": topic_name}, allow_unicode=True, sort_keys=False).strip()
                _atomic_write(topic_path, f"---\n{topic_frontmatter}\n---\n\n# {topic_name}\n")
            topic_target = topic_path.relative_to(root).with_suffix("").as_posix()
            topic_links.append(f"[[{topic_target}|{topic_name}]]")

        frontmatter = {
            "title": metadata.title,
            "created": timestamp.isoformat(),
            "source": "handwritten",
            "document_type": metadata.document_type,
            "category": metadata.category,
            "tags": metadata.tags,
            "status": "reviewed",
            "pages": len(pages),
        }
        yaml_text = yaml.safe_dump(frontmatter, allow_unicode=True, sort_keys=False).strip()
        topics_text = "\n".join(f"- {link}" for link in topic_links) or "- Chưa phân loại"
        sources_text = "\n\n".join(attachment_links)
        note_content = (
            f"---\n{yaml_text}\n---\n\n"
            f"# {metadata.title}\n\n> {metadata.summary}\n\n"
            f"## Nội dung\n\n{markdown.strip()}\n\n"
            f"## Chủ đề liên quan\n\n{topics_text}\n\n"
            f"## Danh mục\n\n[[{category_target}|{metadata.category}]]\n\n"
            f"## Nguồn\n\n{sources_text}\n"
        )
        _atomic_write(note_path, note_content)

        relative_note = note_path.relative_to(root).as_posix()
        vault_name = root.name
        open_uri = obsidian_open_uri(vault_name, relative_note)
        return {
            "note_path": relative_note,
            "open_uri": open_uri,
            "demo_vault": self.settings.vault_path.name == "demo-vault",
        }

    @staticmethod
    def _unique_path(path: Path) -> Path:
        if not path.exists():
            return path
        for suffix in range(2, 1000):
            candidate = path.with_stem(f"{path.stem}-{suffix}")
            if not candidate.exists():
                return candidate
        raise RuntimeError("Could not create a unique note filename")
