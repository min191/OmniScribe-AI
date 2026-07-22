from dataclasses import replace
from pathlib import Path
import tempfile
import unittest

import httpx

import main
from config import Settings
from models import DocumentMetadata, Job, JobStatus, Page
from scripts.migrate_category_links import migrate
from services.obsidian import ObsidianExporter
from services.vault_graph import VaultGraphService, parse_markdown


def settings_for(path: Path, **changes) -> Settings:
    import main
    values = {
        "vault_path": path.resolve(),
        "vault_graph_roots": ("OmniScribe",),
        "vault_graph_max_nodes": 80,
        **changes,
    }
    return replace(main.settings, **values)


class MarkdownParsingTests(unittest.TestCase):
    def test_parses_frontmatter_inline_tags_and_wikilink_variants(self):
        note = parse_markdown(
            "OmniScribe/Inbox/demo.md",
            "---\ntitle: Demo\ncategory: Học tập\ntags: [OCR]\n---\n"
            "# Heading\n#ghi-chú [[OmniScribe/Topics/Vật lý#Cơ học|Nhãn]] [[Simple]]",
        )
        self.assertEqual(note.title, "Demo")
        self.assertEqual(note.category, "Học tập")
        self.assertEqual(note.links, ("OmniScribe/Topics/Vật lý", "Simple"))
        self.assertIn("OCR", note.tags)
        self.assertIn("ghi-chú", note.tags)


class VaultIndexTests(unittest.TestCase):
    def test_omniscribe_directory_can_be_the_vault_root(self):
        with tempfile.TemporaryDirectory() as temp:
            vault = Path(temp) / "OmniScribe"
            inbox = vault / "Inbox"
            inbox.mkdir(parents=True)
            note_path = inbox / "A.md"
            note_path.write_text("---\ncategory: Test\n---\n# A", encoding="utf-8")
            attachments = vault / "Attachments"
            attachments.mkdir()
            (attachments / "ignored.md").write_text("# Attachment", encoding="utf-8")
            nested = vault / "OmniScribe" / "Inbox"
            nested.mkdir(parents=True)
            (nested / "ignored.md").write_text("# Nested artifact", encoding="utf-8")

            service = VaultGraphService(settings_for(vault))
            notes, available, warnings = service.refresh()

            self.assertTrue(available)
            self.assertEqual(warnings, [])
            self.assertIn("Inbox/A.md", notes)
            self.assertNotIn("Attachments/ignored.md", notes)
            self.assertNotIn("OmniScribe/Inbox/ignored.md", notes)
            graph = service.build(
                "job",
                "[[A]]",
                DocumentMetadata(title="Current", category="Test"),
                depth=1,
                include_tags=False,
                current_path="Inbox/A.md",
            )
            current = next(node for node in graph["nodes"] if node["current"])
            self.assertEqual(current["path"], "Inbox/A.md")
            self.assertIn("file=Inbox%2FA.md", current["open_uri"])

    def test_cache_add_update_delete_and_neighborhood(self):
        with tempfile.TemporaryDirectory() as temp:
            vault = Path(temp)
            inbox = vault / "OmniScribe" / "Inbox"
            inbox.mkdir(parents=True)
            a = inbox / "A.md"
            b = inbox / "B.md"
            c = inbox / "C.md"
            a.write_text("---\ncategory: Học tập\n---\n# A\n[[B]]", encoding="utf-8")
            b.write_text("# B\n[[C]]", encoding="utf-8")
            c.write_text("# C", encoding="utf-8")
            service = VaultGraphService(settings_for(vault))
            notes, available, _ = service.refresh()
            self.assertTrue(available)
            self.assertEqual(len(notes), 3)
            cached_a = service._cache["OmniScribe/Inbox/A.md"]
            a.write_text("---\ncategory: Khác\n---\n# A updated\n[[B]]", encoding="utf-8")
            b.unlink()
            notes, _, _ = service.refresh()
            self.assertEqual(len(notes), 2)
            self.assertNotEqual(notes["OmniScribe/Inbox/A.md"], cached_a)

            metadata = DocumentMetadata(title="Hiện tại", category="Khác", topics=[], tags=["x"])
            graph = service.build("job", "[[A]]", metadata, depth=2, include_tags=False)
            ids = {node["id"] for node in graph["nodes"]}
            self.assertIn("note:OmniScribe/Inbox/A.md", ids)
            self.assertNotIn("tag:x", ids)

    def test_invalid_root_is_confined_and_falls_back(self):
        with tempfile.TemporaryDirectory() as temp:
            vault = Path(temp)
            vault.mkdir(exist_ok=True)
            service = VaultGraphService(settings_for(vault, vault_graph_roots=("../outside",)))
            graph = service.build("job", "", DocumentMetadata(title="Demo", category="Test"), 1, True)
            self.assertFalse(graph["vault_available"])
            self.assertTrue(graph["warnings"])
            self.assertNotIn(str(vault.resolve()), str(graph))

    def test_truncation_keeps_center_and_current(self):
        with tempfile.TemporaryDirectory() as temp:
            vault = Path(temp)
            inbox = vault / "OmniScribe" / "Inbox"
            inbox.mkdir(parents=True)
            for index in range(20):
                (inbox / f"N{index}.md").write_text(f"---\ncategory: Test\n---\n# N{index}", encoding="utf-8")
            service = VaultGraphService(settings_for(vault, vault_graph_max_nodes=8))
            graph = service.build("job", "", DocumentMetadata(title="Current", category="Test"), 1, True)
            self.assertTrue(graph["truncated"])
            self.assertEqual(len(graph["nodes"]), 8)
            self.assertEqual(graph["nodes"][0]["id"], graph["center_id"])
            self.assertTrue(graph["nodes"][1]["current"])


class ExportAndMigrationTests(unittest.TestCase):
    def test_export_and_migration_when_omniscribe_is_vault_root(self):
        with tempfile.TemporaryDirectory() as temp:
            vault = Path(temp) / "OmniScribe"
            vault.mkdir()
            exporter = ObsidianExporter(settings_for(vault))

            result = exporter.export(
                "job",
                [Page(1, "a.png", "image/png", b"png")],
                "Nội dung",
                DocumentMetadata(title="Demo", category="Học tập", topics=["Vật lý"]),
            )

            self.assertTrue(result["note_path"].startswith("Inbox/"))
            self.assertFalse((vault / "OmniScribe").exists())
            note_path = vault / result["note_path"]
            note = note_path.read_text(encoding="utf-8")
            self.assertIn("[[Categories/Học tập|Học tập]]", note)
            self.assertIn("[[Topics/Vật lý|Vật lý]]", note)
            self.assertIn("file=Inbox%2F", result["open_uri"])

            legacy = vault / "Inbox" / "legacy.md"
            legacy.write_text("---\nsource: handwritten\ncategory: Khác\n---\n# Cũ\n", encoding="utf-8")
            dry = migrate(vault, apply=False, timestamp="direct")
            self.assertEqual(dry["changed"], ["Inbox/legacy.md"])
            migrate(vault, apply=True, timestamp="direct")
            self.assertTrue((vault / "Categories" / "Học tập.md").is_file())
            self.assertTrue((vault / "Categories" / "Khác.md").is_file())
            self.assertTrue((vault / ".omniscribe-backups" / "direct" / "Inbox" / "legacy.md").is_file())

    def test_export_creates_category_note_and_link_without_overwrite(self):
        with tempfile.TemporaryDirectory() as temp:
            vault = Path(temp)
            category = vault / "OmniScribe" / "Categories" / "Học tập.md"
            category.parent.mkdir(parents=True)
            category.write_text("Nội dung riêng", encoding="utf-8")
            exporter = ObsidianExporter(settings_for(vault))
            result = exporter.export(
                "job",
                [Page(1, "a.png", "image/png", b"png")],
                "Nội dung",
                DocumentMetadata(title="Demo", category="Học tập"),
            )
            note = (vault / result["note_path"]).read_text(encoding="utf-8")
            self.assertIn("## Danh mục", note)
            self.assertIn("[[OmniScribe/Categories/Học tập|Học tập]]", note)
            self.assertEqual(category.read_text(encoding="utf-8"), "Nội dung riêng")
            self.assertIn("file=OmniScribe%2FInbox%2F", result["open_uri"])
            self.assertNotIn("file=OmniScribe/Inbox/", result["open_uri"])

            graph = VaultGraphService(settings_for(vault)).build(
                "job",
                "[[OmniScribe/Inbox/linked]]",
                DocumentMetadata(title="Demo", category="Học tập"),
                depth=1,
                include_tags=True,
                current_path=result["note_path"],
            )
            current = next(node for node in graph["nodes"] if node["current"])
            self.assertIn("file=OmniScribe%2FInbox%2F", current["open_uri"])

    def test_migration_dry_run_apply_backup_and_idempotence(self):
        with tempfile.TemporaryDirectory() as temp:
            vault = Path(temp)
            inbox = vault / "OmniScribe" / "Inbox"
            inbox.mkdir(parents=True)
            note = inbox / "old.md"
            original = "---\nsource: handwritten\ncategory: Học tập\n---\n# Cũ\n"
            note.write_text(original, encoding="utf-8")
            dry = migrate(vault, apply=False, timestamp="stamp")
            self.assertEqual(len(dry["changed"]), 1)
            self.assertEqual(note.read_text(encoding="utf-8"), original)
            applied = migrate(vault, apply=True, timestamp="stamp")
            self.assertEqual(len(applied["changed"]), 1)
            backup = vault / "OmniScribe" / ".omniscribe-backups" / "stamp" / "OmniScribe" / "Inbox" / "old.md"
            self.assertEqual(backup.read_text(encoding="utf-8"), original)
            self.assertIn("## Danh mục", note.read_text(encoding="utf-8"))
            self.assertEqual(migrate(vault, apply=True, timestamp="again")["changed"], [])


class GraphApiTests(unittest.IsolatedAsyncioTestCase):
    async def test_missing_not_ready_and_unavailable_vault(self):
        transport = httpx.ASGITransport(app=main.app)
        async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
            missing = await client.post("/api/jobs/missing/graph-preview", json={
                "markdown": "Demo", "metadata": {"title": "Demo"}, "depth": 1, "include_tags": True,
            })
            self.assertEqual(missing.status_code, 404)

            queued = Job("graph-queued", [Page(1, "a.png", "image/png", b"png")])
            await main.job_store.add(queued)
            conflict = await client.post("/api/jobs/graph-queued/graph-preview", json={
                "markdown": "Demo", "metadata": {"title": "Demo"}, "depth": 1, "include_tags": True,
            })
            self.assertEqual(conflict.status_code, 409)

            with tempfile.TemporaryDirectory() as temp:
                missing_vault = Path(temp) / "does-not-exist"
                original = main.vault_graph_service
                main.vault_graph_service = VaultGraphService(settings_for(missing_vault))
                ready = Job("graph-ready", [Page(1, "a.png", "image/png", b"png")], status=JobStatus.READY)
                await main.job_store.add(ready)
                try:
                    response = await client.post("/api/jobs/graph-ready/graph-preview", json={
                        "markdown": "[[Secret]]", "metadata": {"title": "Demo", "category": "Test"}, "depth": 1, "include_tags": True,
                    })
                finally:
                    main.vault_graph_service = original
                self.assertEqual(response.status_code, 200)
                payload = response.json()
                self.assertFalse(payload["vault_available"])
                self.assertNotIn(str(missing_vault.resolve()), response.text)


if __name__ == "__main__":
    unittest.main()
