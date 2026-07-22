import asyncio
import logging
from pathlib import Path
import uuid

from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parent / ".env")

from fastapi import FastAPI, File, Header, HTTPException, UploadFile, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response, StreamingResponse

from config import Settings
from job_store import job_store
from models import ExportRequest, GraphPreviewRequest, Job, JobStatus, Page, PageStatus
from services.glm_ocr import GlmOcrService
from services.metadata_llm import MetadataLlmService
from services.obsidian import ObsidianExporter
from services.vault_graph import VaultGraphService


settings = Settings.from_env()
ocr_service = GlmOcrService(settings)
metadata_service = MetadataLlmService(settings)
obsidian_exporter = ObsidianExporter(settings)
vault_graph_service = VaultGraphService(settings)
background_tasks: set[asyncio.Task] = set()
logger = logging.getLogger("uvicorn.error")

app = FastAPI(title="OmniScribe AI", version="1.0.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=list(settings.cors_origins),
    allow_credentials=False,
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type", "Last-Event-ID"],
)


def detect_image_type(content: bytes) -> str | None:
    if content.startswith(b"\x89PNG\r\n\x1a\n"):
        return "image/png"
    if content.startswith(b"\xff\xd8\xff"):
        return "image/jpeg"
    return None


@app.get("/")
async def root() -> dict[str, str]:
    return {"name": "OmniScribe AI", "status": "running"}


@app.get("/api/health")
async def health() -> dict:
    return {
        "status": "ok",
        "demo_mode": settings.demo_mode,
        "ocr_configured": bool(settings.z_ai_api_key),
        "llm_configured": bool(settings.llm_api_key),
        "vault_configured": settings.vault_path.name != "demo-vault",
        "limits": {
            "max_files": settings.max_upload_files,
            "max_image_bytes": settings.max_image_bytes,
        },
    }


@app.post("/api/jobs", status_code=status.HTTP_202_ACCEPTED)
async def create_job(files: list[UploadFile] = File(...)) -> dict:
    if not files:
        raise HTTPException(status_code=400, detail="Hãy chọn ít nhất một ảnh.")
    if len(files) > settings.max_upload_files:
        raise HTTPException(
            status_code=400,
            detail=f"Mỗi lần chỉ xử lý tối đa {settings.max_upload_files} ảnh.",
        )

    pages: list[Page] = []
    for index, upload in enumerate(files, start=1):
        content = await upload.read(settings.max_image_bytes + 1)
        if len(content) > settings.max_image_bytes:
            raise HTTPException(
                status_code=413,
                detail=f"{upload.filename or f'Trang {index}'} vượt quá giới hạn 10 MB.",
            )
        detected_type = detect_image_type(content)
        if not detected_type:
            raise HTTPException(
                status_code=415,
                detail=f"{upload.filename or f'Trang {index}'} không phải ảnh JPG hoặc PNG hợp lệ.",
            )
        pages.append(
            Page(
                number=index,
                filename=Path(upload.filename or f"page-{index}").name,
                mime_type=detected_type,
                content=content,
            )
        )

    job = Job(id=str(uuid.uuid4()), pages=pages)
    await job_store.add(job)
    task = asyncio.create_task(process_job(job.id))
    background_tasks.add(task)
    task.add_done_callback(background_tasks.discard)
    return {"job_id": job.id, "status": job.status.value, "total_pages": len(pages)}


@app.get("/api/jobs/{job_id}")
async def get_job(job_id: str) -> dict:
    job = await job_store.get(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Không tìm thấy phiên xử lý.")
    return job.snapshot()


@app.get("/api/jobs/{job_id}/pages/{page_number}/image")
async def get_page_image(job_id: str, page_number: int) -> Response:
    job = await job_store.get(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Không tìm thấy phiên xử lý.")
    page = next((item for item in job.pages if item.number == page_number), None)
    if not page:
        raise HTTPException(status_code=404, detail="Không tìm thấy trang.")
    return Response(
        content=page.content,
        media_type=page.mime_type,
        headers={"Cache-Control": "private, max-age=3600"},
    )


@app.get("/api/jobs/{job_id}/events")
async def stream_job(
    job_id: str,
    last_event_id: str | None = Header(default=None, alias="Last-Event-ID"),
    after: int = 0,
) -> StreamingResponse:
    job = await job_store.get(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Không tìm thấy phiên xử lý.")
    try:
        cursor = int(last_event_id) if last_event_id else after
    except ValueError:
        cursor = 0
    return StreamingResponse(
        job_store.stream(job_id, max(cursor, 0)),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache, no-transform",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@app.post("/api/jobs/{job_id}/export")
async def export_job(job_id: str, request: ExportRequest) -> dict:
    job = await job_store.get(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Không tìm thấy phiên xử lý.")
    if job.status not in {JobStatus.READY, JobStatus.EXPORTED}:
        raise HTTPException(status_code=409, detail="Tài liệu chưa sẵn sàng để lưu.")
    if job.status == JobStatus.EXPORTED and job.export_result:
        return job.export_result

    job.status = JobStatus.EXPORTING
    await job_store.emit(job_id, "export.started")
    try:
        result = await asyncio.to_thread(
            obsidian_exporter.export,
            job.id,
            job.pages,
            request.markdown,
            request.metadata,
        )
        job.status = JobStatus.EXPORTED
        job.metadata = request.metadata
        job.combined_markdown = request.markdown
        job.export_result = result
        await job_store.emit(job_id, "export.completed", result=result)
        return result
    except Exception as error:
        job.status = JobStatus.READY
        await job_store.emit(job_id, "export.failed", error=str(error))
        raise HTTPException(status_code=500, detail=f"Không thể ghi vào vault: {error}") from error


@app.post("/api/jobs/{job_id}/graph-preview")
async def graph_preview(job_id: str, request: GraphPreviewRequest) -> dict:
    job = await job_store.get(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Không tìm thấy phiên xử lý.")
    if job.status not in {JobStatus.READY, JobStatus.EXPORTED}:
        raise HTTPException(status_code=409, detail="Tài liệu chưa sẵn sàng để dựng graph.")
    current_path = job.export_result.get("note_path") if job.export_result else None
    return await asyncio.to_thread(
        vault_graph_service.build,
        job.id,
        request.markdown,
        request.metadata,
        request.depth,
        request.include_tags,
        current_path,
    )


async def process_job(job_id: str) -> None:
    job = await job_store.get(job_id)
    if not job:
        return
    try:
        job.status = JobStatus.PROCESSING
        await job_store.emit(job_id, "job.started", total_pages=len(job.pages))

        async def process_page(page: Page) -> None:
            page.status = PageStatus.PROCESSING
            await job_store.emit(job_id, "page.ocr_started", page=page.number)
            try:
                page.markdown = await ocr_service.parse(page.content, page.mime_type, page.number)
                page.status = PageStatus.DONE
                await job_store.emit(
                    job_id,
                    "page.ocr_completed",
                    page=page.number,
                    processed_pages=job.processed_pages,
                    total_pages=len(job.pages),
                    markdown=page.markdown,
                )
            except Exception as error:
                logger.exception(
                    "OCR failed for job %s, page %s (%s)",
                    job_id,
                    page.number,
                    page.filename,
                )
                page.status = PageStatus.ERROR
                page.error = str(error)
                await job_store.emit(
                    job_id,
                    "page.ocr_failed",
                    page=page.number,
                    processed_pages=job.processed_pages,
                    total_pages=len(job.pages),
                    error=str(error),
                )

        await asyncio.gather(*(process_page(page) for page in job.pages))
        successful_pages = [page for page in job.pages if page.status == PageStatus.DONE]
        if not successful_pages:
            raise RuntimeError("Không trang nào được OCR thành công.")

        sections = []
        for page in job.pages:
            content = page.markdown if page.markdown else f"> Không thể đọc trang {page.number}: {page.error}"
            sections.append(f"<!-- page:{page.number} -->\n\n{content}")
        job.combined_markdown = "\n\n---\n\n".join(sections)
        job.status = JobStatus.ORGANIZING
        await job_store.emit(job_id, "document.organizing")

        job.metadata = await metadata_service.organize(job.combined_markdown)
        job.status = JobStatus.READY
        await job_store.emit(
            job_id,
            "document.ready",
            metadata=job.metadata.model_dump(),
            markdown=job.combined_markdown,
        )
    except Exception as error:
        logger.error("Job %s failed: %s", job_id, error)
        job.status = JobStatus.ERROR
        job.error = str(error)
        await job_store.emit(job_id, "job.failed", error=str(error))
