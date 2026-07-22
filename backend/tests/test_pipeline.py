import asyncio
from dataclasses import replace
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

import httpx

import main
from config import Settings
from job_store import JobStore
from models import DocumentMetadata, Job, Page
from services.glm_ocr import GlmOcrService
from services.metadata_llm import METADATA_PROMPT, MetadataLlmService, normalize_generated_metadata
from services.obsidian import ObsidianExporter, slugify


PNG_BYTES = b"\x89PNG\r\n\x1a\n" + b"demo-image-content"


class CoreTests(unittest.TestCase):
    def test_metadata_prompt_is_strict_language_aware_and_concise(self):
        self.assertLessEqual(len(METADATA_PROMPT.split()), 150)
        self.assertIn("predominant source language", METADATA_PROMPT)
        self.assertIn("do not translate", METADATA_PROMPT)
        self.assertIn("untrusted OCR content", METADATA_PROMPT)
        self.assertIn("never invent", METADATA_PROMPT)
        self.assertIn("Output JSON only", METADATA_PROMPT)
        self.assertIn("at most 24 characters", METADATA_PROMPT)
        self.assertIn("never fill a quota", METADATA_PROMPT)

    def test_generated_metadata_drops_long_and_redundant_topics_and_tags(self):
        payload = normalize_generated_metadata({
            "title": "Electric dipole",
            "category": "Physics",
            "topics": ["Physics", "Classical electromagnetism", "Electric dipole theory", "Field energy"],
            "tags": ["#electric-dipole", "torque", "a retrieval facet that is much too long"],
        })

        self.assertEqual(payload["topics"], ["Classical electromagnetism", "Field energy"])
        self.assertEqual(payload["tags"], ["torque"])

    def test_generated_metadata_prefers_first_distinct_values_without_truncating(self):
        payload = normalize_generated_metadata({
            "title": "Bài giảng",
            "category": "Vật lý",
            "topics": ["Điện trường", "điện-trường", "Mô men lực", "Năng lượng", "Từ trường"],
            "tags": ["ôn tập", "ÔN-TẬP", "bài tập", "thí nghiệm"],
        })

        self.assertEqual(payload["topics"], ["Điện trường", "Mô men lực", "Năng lượng"])
        self.assertEqual(payload["tags"], ["ôn tập", "bài tập", "thí nghiệm"])

    def test_detect_image_type_uses_magic_bytes(self):
        self.assertEqual(main.detect_image_type(PNG_BYTES), "image/png")
        self.assertEqual(main.detect_image_type(b"\xff\xd8\xffdemo"), "image/jpeg")
        self.assertIsNone(main.detect_image_type(b"not-an-image"))

    def test_slugify_handles_vietnamese_and_windows_names(self):
        self.assertEqual(slugify("Ghi chú Toán học"), "ghi-chu-toan-hoc")
        self.assertEqual(slugify("CON"), "ghi-chu")

    def test_demo_mode_does_not_write_to_configured_real_vault(self):
        with tempfile.TemporaryDirectory() as real_vault:
            with patch.dict(
                "os.environ",
                {"DEMO_MODE": "true", "VAULT_PATH": real_vault, "DEMO_ALLOW_VAULT_WRITE": "false"},
                clear=False,
            ):
                settings = Settings.from_env()
        self.assertEqual(settings.vault_path.name, "demo-vault")

    def test_glm_ocr_accepts_base_or_full_layout_parsing_url(self):
        base_settings = replace(
            main.settings,
            z_ai_base_url="https://api.z.ai/api/paas/v4",
        )
        full_url_settings = replace(
            main.settings,
            z_ai_base_url="https://api.z.ai/api/paas/v4/layout_parsing/",
        )

        self.assertEqual(
            GlmOcrService(base_settings).endpoint_url,
            "https://api.z.ai/api/paas/v4/layout_parsing",
        )
        self.assertEqual(
            GlmOcrService(full_url_settings).endpoint_url,
            "https://api.z.ai/api/paas/v4/layout_parsing",
        )

    def test_metadata_keeps_only_three_primary_tags(self):
        metadata = DocumentMetadata(
            title="Demo",
            tags=["OCR", "ocr", "ghi-chu", "hoc-tap", "du-thua"],
        )
        self.assertEqual(metadata.tags, ["OCR", "ghi-chu", "hoc-tap"])


class JobStoreTests(unittest.IsolatedAsyncioTestCase):
    async def test_late_subscriber_receives_replayed_events(self):
        store = JobStore()
        job = Job(
            id="replay-job",
            pages=[Page(number=1, filename="page.png", mime_type="image/png", content=PNG_BYTES)],
        )
        await store.add(job)
        await store.emit(job.id, "job.started", total_pages=1)
        stream = store.stream(job.id)
        first_event = await anext(stream)
        payload = json.loads(first_event.split("data: ", 1)[1])
        self.assertEqual(payload["type"], "job.started")
        await stream.aclose()


class ApiFlowTests(unittest.IsolatedAsyncioTestCase):
    async def test_demo_upload_review_and_export(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            demo_settings = replace(
                main.settings,
                vault_path=Path(temp_dir).resolve(),
                demo_mode=True,
            )
            original_ocr_service = main.ocr_service
            original_metadata_service = main.metadata_service
            original_exporter = main.obsidian_exporter
            main.ocr_service = GlmOcrService(demo_settings)
            main.metadata_service = MetadataLlmService(demo_settings)
            main.obsidian_exporter = ObsidianExporter(demo_settings)
            transport = httpx.ASGITransport(app=main.app)
            try:
                async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
                    response = await client.post(
                        "/api/jobs",
                        files=[("files", ("page.png", PNG_BYTES, "image/png"))],
                    )
                    self.assertEqual(response.status_code, 202)
                    job_id = response.json()["job_id"]

                    snapshot = None
                    for _ in range(80):
                        snapshot = (await client.get(f"/api/jobs/{job_id}")).json()
                        if snapshot["status"] in {"ready", "error"}:
                            break
                        await asyncio.sleep(0.05)

                    self.assertEqual(snapshot["status"], "ready")
                    self.assertTrue(snapshot["combined_markdown"])
                    self.assertTrue(snapshot["metadata"]["topics"])

                    export_response = await client.post(
                        f"/api/jobs/{job_id}/export",
                        json={
                            "markdown": snapshot["combined_markdown"],
                            "metadata": snapshot["metadata"],
                        },
                    )
                    self.assertEqual(export_response.status_code, 200)
                    note_path = Path(temp_dir) / export_response.json()["note_path"]
                    self.assertTrue(note_path.exists())
                    note_text = note_path.read_text(encoding="utf-8")
                    self.assertIn("[[OmniScribe/Topics/", note_text)
                    self.assertIn("[[OmniScribe/Categories/", note_text)
                    self.assertIn("page-01.png", note_text)
            finally:
                main.ocr_service = original_ocr_service
                main.metadata_service = original_metadata_service
                main.obsidian_exporter = original_exporter

    async def test_invalid_upload_is_rejected(self):
        transport = httpx.ASGITransport(app=main.app)
        async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.post(
                "/api/jobs",
                files=[("files", ("fake.png", b"not-an-image", "image/png"))],
            )
        self.assertEqual(response.status_code, 415)


if __name__ == "__main__":
    unittest.main()
