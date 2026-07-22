from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path, PurePosixPath
import re
import threading

import yaml

from config import Settings
from models import DocumentMetadata
from services.obsidian import _safe_topic, obsidian_open_uri, omniscribe_content_root, omniscribe_relative_path, slugify


WIKILINK_RE = re.compile(r"\[\[([^\]|#]+)(?:#[^\]|]*)?(?:\|([^\]]+))?\]\]")
INLINE_TAG_RE = re.compile(r"(?<![\w/])#([\w\-À-ỹ/]+)", re.UNICODE)


@dataclass(frozen=True)
class IndexedNote:
    path: str
    title: str
    category: str
    tags: tuple[str, ...]
    links: tuple[str, ...]
    signature: tuple[int, int]


def _clean_list(value) -> list[str]:
    source = value if isinstance(value, list) else [value] if value else []
    return [str(item).strip().lstrip("#") for item in source if str(item).strip()]


def parse_markdown(path: str, text: str, signature: tuple[int, int] = (0, 0)) -> IndexedNote:
    metadata: dict = {}
    body = text
    if text.startswith("---"):
        match = re.match(r"^---\s*\n(.*?)\n---\s*(?:\n|$)", text, re.DOTALL)
        if match:
            loaded = yaml.safe_load(match.group(1)) or {}
            metadata = loaded if isinstance(loaded, dict) else {}
            body = text[match.end():]
    title_match = re.search(r"^#\s+(.+?)\s*$", body, re.MULTILINE)
    title = str(metadata.get("title") or (title_match.group(1) if title_match else Path(path).stem)).strip()
    category_value = metadata.get("category", "")
    category = str(category_value if not isinstance(category_value, list) else (category_value[0] if category_value else "")).strip()
    tags = _clean_list(metadata.get("tags"))
    tags.extend(match.group(1) for match in INLINE_TAG_RE.finditer(body))
    links = tuple(dict.fromkeys(match.group(1).strip() for match in WIKILINK_RE.finditer(body)))
    return IndexedNote(path, title, category, tuple(dict.fromkeys(tags)), links, signature)


class VaultGraphService:
    def __init__(self, settings: Settings) -> None:
        self.settings = settings
        self._cache: dict[str, IndexedNote] = {}
        self._lock = threading.Lock()

    def _safe_roots(self) -> tuple[list[Path], list[str]]:
        root = self.settings.vault_path
        warnings: list[str] = []
        if not root.is_dir():
            return [], ["Không thể đọc vault; đang dùng graph từ metadata."]
        resolved_root = root.resolve()
        roots: list[Path] = []
        for configured in self.settings.vault_graph_roots:
            relative = PurePosixPath(configured)
            if relative.is_absolute() or ".." in relative.parts:
                warnings.append(f"Bỏ qua graph root không hợp lệ: {configured}")
                continue
            if configured == ".":
                candidate = root
            elif configured.casefold() == "omniscribe" and omniscribe_content_root(root) == root:
                candidate = root
            else:
                candidate = root.joinpath(*relative.parts)
            try:
                resolved = candidate.resolve()
                resolved.relative_to(resolved_root)
            except (OSError, ValueError):
                warnings.append(f"Bỏ qua graph root ngoài vault: {configured}")
                continue
            if resolved.is_dir() and not candidate.is_symlink():
                roots.append(candidate)
            else:
                warnings.append(f"Không tìm thấy graph root: {configured}")
        return roots, warnings

    def refresh(self) -> tuple[dict[str, IndexedNote], bool, list[str]]:
        with self._lock:
            return self._refresh_unlocked()

    def _refresh_unlocked(self) -> tuple[dict[str, IndexedNote], bool, list[str]]:
        roots, warnings = self._safe_roots()
        if not roots:
            self._cache.clear()
            return {}, False, warnings
        vault = self.settings.vault_path.resolve()
        content_root = omniscribe_content_root(vault).resolve()
        attachments_root = content_root / "Attachments"
        direct_layout = content_root == vault
        found: set[str] = set()
        for graph_root in roots:
            for path in graph_root.rglob("*.md"):
                try:
                    if path.is_symlink() or ".obsidian" in path.parts:
                        continue
                    resolved = path.resolve()
                    relative_path = resolved.relative_to(vault)
                    if attachments_root in resolved.parents:
                        continue
                    if direct_layout and relative_path.parts and relative_path.parts[0].casefold() == "omniscribe":
                        continue
                    relative = relative_path.as_posix()
                    stat = resolved.stat()
                    signature = (stat.st_mtime_ns, stat.st_size)
                    found.add(relative)
                    cached = self._cache.get(relative)
                    if not cached or cached.signature != signature:
                        self._cache[relative] = parse_markdown(relative, resolved.read_text(encoding="utf-8"), signature)
                except (OSError, UnicodeError, ValueError, yaml.YAMLError):
                    warnings.append(f"Không thể index note: {path.name}")
        for stale in set(self._cache) - found:
            del self._cache[stale]
        return dict(self._cache), True, warnings

    @staticmethod
    def _lookup(notes: dict[str, IndexedNote], target: str) -> IndexedNote | None:
        normalized = target.strip().replace("\\", "/").removesuffix(".md").strip("/").casefold()
        by_path = {note.path.removesuffix(".md").casefold(): note for note in notes.values()}
        if normalized in by_path:
            return by_path[normalized]
        basename = normalized.rsplit("/", 1)[-1]
        matches = [note for note in notes.values() if Path(note.path).stem.casefold() == basename or note.title.casefold() == basename]
        return sorted(matches, key=lambda note: note.path.casefold())[0] if matches else None

    def build(self, job_id: str, markdown: str, metadata: DocumentMetadata, depth: int, include_tags: bool, current_path: str | None = None) -> dict:
        notes, available, warnings = self.refresh()
        category_label = metadata.category or "Chưa phân loại"
        center_id = f"category:{slugify(category_label, 'chua-phan-loai')}"
        current_note = notes.get(current_path or "")
        current_id = f"note:{current_note.path}" if current_note else f"current:{job_id}"
        category_target = omniscribe_relative_path(self.settings.vault_path, "Categories", _safe_topic(category_label))
        category_note = self._lookup(notes, category_target)
        nodes: dict[str, dict] = {
            center_id: {"id": center_id, "label": category_label, "type": "category", "exists": bool(category_note), "current": False, **({"path": category_note.path} if category_note else {})},
            current_id: {"id": current_id, "label": metadata.title, "type": "document", "exists": bool(current_note), "current": True},
        }
        if current_note:
            nodes[current_id]["path"] = current_note.path
        edges: dict[tuple[str, str, str], dict] = {}
        priority = {center_id: 0, current_id: 1}

        def add_edge(source: str, target: str, edge_type: str) -> None:
            if source != target:
                edges[(source, target, edge_type)] = {"source": source, "target": target, "type": edge_type}

        def add_note(note: IndexedNote) -> str:
            node_id = f"note:{note.path}"
            nodes.setdefault(node_id, {"id": node_id, "label": note.title, "type": "note", "exists": True, "current": node_id == current_id, "path": note.path})
            return node_id

        add_edge(center_id, current_id, "category")
        same_category = sorted((note for note in notes.values() if note.category.casefold() == category_label.casefold()), key=lambda note: note.path.casefold())
        for index, note in enumerate(same_category):
            note_id = add_note(note)
            priority.setdefault(note_id, 20 + index)
            add_edge(center_id, note_id, "category")

        parsed_current = parse_markdown("", markdown)
        direct: list[IndexedNote] = []
        for index, target in enumerate(parsed_current.links):
            note = self._lookup(notes, target)
            if note:
                direct.append(note)
                note_id = add_note(note)
                priority[note_id] = min(priority.get(note_id, 10 + index), 10 + index)
                add_edge(current_id, note_id, "wikilink")
        for index, topic in enumerate(metadata.topics):
            topic_target = omniscribe_relative_path(self.settings.vault_path, "Topics", topic)
            note = self._lookup(notes, topic_target) or self._lookup(notes, topic)
            if note:
                note_id = add_note(note)
                priority[note_id] = min(priority.get(note_id, 15 + index), 15 + index)
                add_edge(current_id, note_id, "topic")
            else:
                node_id = f"topic:{slugify(topic)}"
                nodes.setdefault(node_id, {"id": node_id, "label": topic, "type": "topic", "exists": False, "current": False})
                priority.setdefault(node_id, 15 + index)
                add_edge(current_id, node_id, "topic")
        if include_tags:
            for index, tag in enumerate(metadata.tags[:3]):
                node_id = f"tag:{slugify(tag)}"
                nodes.setdefault(node_id, {"id": node_id, "label": tag, "type": "tag", "exists": False, "current": False})
                priority.setdefault(node_id, 18 + index)
                add_edge(current_id, node_id, "tag")

        if depth == 2:
            frontier = list(dict.fromkeys(note.path for note in direct))
            for path in frontier:
                source = notes[path]
                source_id = add_note(source)
                for target in source.links:
                    linked = self._lookup(notes, target)
                    if linked:
                        linked_id = add_note(linked)
                        priority.setdefault(linked_id, 30)
                        add_edge(source_id, linked_id, "wikilink")

        ordered_ids = sorted(nodes, key=lambda node_id: (priority.get(node_id, 40), nodes[node_id]["label"].casefold(), node_id))
        truncated = len(ordered_ids) > self.settings.vault_graph_max_nodes
        keep = set(ordered_ids[: self.settings.vault_graph_max_nodes])
        final_edges = [edge for edge in edges.values() if edge["source"] in keep and edge["target"] in keep]
        degrees = {node_id: 0 for node_id in keep}
        for edge in final_edges:
            degrees[edge["source"]] += 1
            degrees[edge["target"]] += 1
        vault_name = self.settings.vault_path.name
        final_nodes = []
        for node_id in ordered_ids:
            if node_id not in keep:
                continue
            node = {**nodes[node_id], "degree": degrees[node_id]}
            if node.get("path"):
                node["open_uri"] = obsidian_open_uri(vault_name, node["path"])
            final_nodes.append(node)
        return {"center_id": center_id, "nodes": final_nodes, "edges": final_edges, "truncated": truncated, "vault_available": available, "warnings": list(dict.fromkeys(warnings))}
