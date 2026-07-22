import asyncio
import base64

import httpx

from config import Settings


class GlmOcrService:
    def __init__(self, settings: Settings) -> None:
        self.settings = settings
        self.semaphore = asyncio.Semaphore(settings.ocr_concurrency)
        base_url = settings.z_ai_base_url.rstrip("/")
        self.endpoint_url = (
            base_url
            if base_url.endswith("/layout_parsing")
            else f"{base_url}/layout_parsing"
        )

    async def parse(self, content: bytes, mime_type: str, page_number: int) -> str:
        if self.settings.demo_mode:
            await asyncio.sleep(0.35 + page_number * 0.12)
            return self._demo_markdown(page_number)
        if not self.settings.z_ai_api_key:
            raise RuntimeError("Z_AI_API_KEY is not configured")

        encoded = base64.b64encode(content).decode("ascii")
        data_uri = f"data:{mime_type};base64,{encoded}"
        payload = {"model": "glm-ocr", "file": data_uri}
        headers = {"Authorization": f"Bearer {self.settings.z_ai_api_key}"}

        async with self.semaphore:
            async with httpx.AsyncClient(timeout=90) as client:
                for attempt in range(3):
                    try:
                        response = await client.post(
                            self.endpoint_url,
                            headers=headers,
                            json=payload,
                        )
                        if response.status_code == 429 or response.status_code >= 500:
                            response.raise_for_status()
                        if response.status_code >= 400:
                            detail = response.text[:300]
                            raise RuntimeError(f"GLM-OCR rejected the image ({response.status_code}): {detail}")
                        result = response.json()
                        markdown = result.get("md_results")
                        if not isinstance(markdown, str) or not markdown.strip():
                            raise RuntimeError("GLM-OCR response did not contain md_results")
                        return markdown.strip()
                    except (httpx.TimeoutException, httpx.NetworkError, httpx.HTTPStatusError):
                        if attempt == 2:
                            raise
                        await asyncio.sleep(0.75 * (2**attempt))

        raise RuntimeError("GLM-OCR request failed")

    @staticmethod
    def _demo_markdown(page_number: int) -> str:
        if page_number % 3 == 1:
            return (
                "# Ghi chú bài học\n\n"
                "Đây là kết quả mô phỏng trong **Demo mode**. Cấu hình API để nhận nội dung thật.\n\n"
                "- Ý chính thứ nhất\n- Ý chính thứ hai"
            )
        if page_number % 3 == 2:
            return (
                "## Bảng tổng hợp\n\n"
                "| Khái niệm | Mô tả |\n| --- | --- |\n"
                "| OCR | Nhận dạng nội dung |\n| Markdown | Định dạng đầu ra |"
            )
        return "## Công thức\n\nNăng lượng được ghi lại dưới dạng:\n\n$$E = mc^2$$"
