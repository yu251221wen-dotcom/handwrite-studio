from __future__ import annotations

from io import BytesIO
from urllib.parse import quote

from fastapi import Body, FastAPI, File, Form, Header, HTTPException, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, Response
from PIL import Image

from server.config import settings
from server.modules.document_parser import DocxParseError, parse_docx
from server.resource_store import ResourceError, ResourceStore
from server.session_store import InvalidSession, SessionStore

VERSION = "3.1.0"
FONT_LIMIT_BYTES = min(settings.max_upload_bytes, 32 * 1024 * 1024)
BACKGROUND_LIMIT_BYTES = min(settings.max_upload_bytes, 25 * 1024 * 1024)
sessions = SessionStore(settings.upload_dir, settings.temp_file_ttl_hours)

app = FastAPI(title="Handwrite Studio API", version=VERSION)
app.add_middleware(
    CORSMiddleware,
    allow_origins=list(settings.allowed_origins),
    allow_credentials=False,
    allow_methods=["GET", "POST", "PUT", "DELETE"],
    allow_headers=["Content-Type", "X-Session-ID"],
)


def _http_error(error: Exception, status_code: int = 422) -> HTTPException:
    return HTTPException(status_code=status_code, detail=str(error))


def _store(session_id: str | None) -> ResourceStore:
    try:
        return sessions.resources(session_id)
    except InvalidSession as error:
        raise _http_error(error, 401) from error


def _session_id(session_id: str | None) -> str:
    try:
        return sessions.validate(session_id)
    except InvalidSession as error:
        raise _http_error(error, 401) from error


def _base_url(request: Request) -> str:
    return str(request.base_url).rstrip("/")


def _asset_url(item: dict, request: Request, session_id: str, kind: str) -> dict:
    return {**item, "fileUrl": f"{_base_url(request)}/api/{kind}/{item['id']}/file?session={session_id}"}


def _mime_allowed(file: UploadFile, allowed: set[str]) -> bool:
    return not file.content_type or file.content_type.lower() in allowed | {"application/octet-stream"}


@app.get("/health")
@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok", "version": VERSION, "environment": settings.environment}


@app.post("/api/session")
def create_session() -> dict[str, int | str]:
    sessions.cleanup_expired()
    return {"sessionId": sessions.create(), "expiresInHours": settings.temp_file_ttl_hours}


@app.post("/api/documents/parse")
async def parse_document(file: UploadFile = File(...), x_session_id: str | None = Header(None)) -> dict:
    _store(x_session_id)
    filename = file.filename or "document.docx"
    if not filename.lower().endswith(".docx") or not _mime_allowed(file, {
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "application/zip"
    }):
        raise HTTPException(status_code=415, detail="仅支持有效 DOCX")
    content = await file.read(settings.max_upload_bytes + 1)
    if len(content) > settings.max_upload_bytes:
        raise HTTPException(status_code=413, detail=f"文件不能超过 {settings.max_upload_size_mb} MB")
    try:
        document = parse_docx(content, filename)
    except DocxParseError as error:
        raise _http_error(error) from error
    # V3.1 production flow consumes DocumentBlock directly. Keep an empty fields
    # collection for old clients, but do not invoke the deprecated field mapper.
    return {"document": document, "fields": []}


@app.get("/api/fonts")
def list_fonts(request: Request, x_session_id: str | None = Header(None)) -> list[dict]:
    session_id = _session_id(x_session_id)
    return [_asset_url(item, request, session_id, "fonts") for item in _store(session_id).list_fonts("")]


@app.post("/api/fonts")
async def upload_font(request: Request, file: UploadFile = File(...), previewName: str = Form(""), x_session_id: str | None = Header(None)) -> dict:
    session_id = _session_id(x_session_id); store = _store(session_id)
    if not _mime_allowed(file, {"font/ttf", "font/otf", "application/x-font-ttf", "application/x-font-opentype"}):
        raise HTTPException(status_code=415, detail="字体 MIME 类型无效")
    content = await file.read(FONT_LIMIT_BYTES + 1)
    if len(content) > FONT_LIMIT_BYTES:
        raise HTTPException(status_code=413, detail="字体文件过大")
    try:
        return _asset_url(store.save_font(file.filename or "font.ttf", content, previewName, ""), request, session_id, "fonts")
    except ResourceError as error:
        raise _http_error(error) from error


@app.get("/api/fonts/{resource_id}/file")
def font_file(resource_id: str, session: str | None = None) -> FileResponse:
    try:
        path = _store(session).font_path(resource_id)
    except ResourceError as error:
        raise _http_error(error, 404) from error
    return FileResponse(path, media_type="font/otf" if path.suffix == ".otf" else "font/ttf")


@app.get("/api/backgrounds")
def list_backgrounds(request: Request, x_session_id: str | None = Header(None)) -> list[dict]:
    session_id = _session_id(x_session_id)
    return [_asset_url(item, request, session_id, "backgrounds") for item in _store(session_id).list_backgrounds("")]


@app.post("/api/backgrounds")
async def upload_background(request: Request, file: UploadFile = File(...), x_session_id: str | None = Header(None)) -> dict:
    session_id = _session_id(x_session_id); store = _store(session_id)
    if not _mime_allowed(file, {"image/png", "image/jpeg"}):
        raise HTTPException(status_code=415, detail="背景 MIME 类型无效")
    content = await file.read(BACKGROUND_LIMIT_BYTES + 1)
    if len(content) > BACKGROUND_LIMIT_BYTES:
        raise HTTPException(status_code=413, detail="背景文件过大")
    try:
        return _asset_url(store.save_background(file.filename or "background.png", content, ""), request, session_id, "backgrounds")
    except ResourceError as error:
        raise _http_error(error) from error


@app.get("/api/backgrounds/{resource_id}/file")
def background_file(resource_id: str, session: str | None = None) -> FileResponse:
    try:
        path = _store(session).background_path(resource_id)
    except ResourceError as error:
        raise _http_error(error, 404) from error
    return FileResponse(path, media_type="image/png" if path.suffix == ".png" else "image/jpeg")


@app.put("/api/projects/{project_id}")
def save_project(project_id: str, state: dict = Body(...), x_session_id: str | None = Header(None)) -> dict[str, str]:
    store = _store(x_session_id)
    if state.get("schemaVersion") != 3 or not isinstance(state.get("pages"), list):
        raise HTTPException(status_code=422, detail="项目状态格式无效")
    path = store.save_project(project_id, state)
    return {"status": "saved", "path": str(path.relative_to(store.root)).replace("\\", "/")}


@app.get("/api/projects/{project_id}")
def load_project(project_id: str, x_session_id: str | None = Header(None)) -> dict:
    try:
        return _store(x_session_id).load_project(project_id)
    except ResourceError as error:
        raise _http_error(error, 404) from error


@app.post("/api/export/pdf")
async def export_pdf(name: str = Form("handwrite"), files: list[UploadFile] = File(...), x_session_id: str | None = Header(None)) -> Response:
    store = _store(x_session_id)
    if not files:
        raise HTTPException(status_code=422, detail="至少需要一页图片")
    images: list[Image.Image] = []
    for file in files:
        content = await file.read(BACKGROUND_LIMIT_BYTES + 1)
        if len(content) > BACKGROUND_LIMIT_BYTES or not content.startswith(b"\x89PNG\r\n\x1a\n"):
            raise HTTPException(status_code=422, detail="PDF 页面必须是有效 PNG")
        try:
            images.append(Image.open(BytesIO(content)).convert("RGB"))
        except OSError as error:
            raise _http_error(ValueError("PDF 页面图片无效")) from error
    output = BytesIO()
    images[0].save(output, format="PDF", save_all=True, append_images=images[1:], resolution=images[0].width / (210 / 25.4))
    content = output.getvalue(); store.save_binary_export(name, content, "pdf")
    return Response(content, media_type="application/pdf", headers={"Content-Disposition": f"attachment; filename=handwrite.pdf; filename*=UTF-8''{quote(name, safe='')}.pdf"})


@app.post("/api/exports/{name}")
async def save_acceptance_export(name: str, file: UploadFile = File(...), x_session_id: str | None = Header(None)) -> dict[str, str]:
    store = _store(x_session_id)
    content = await file.read(BACKGROUND_LIMIT_BYTES + 1)
    if len(content) > BACKGROUND_LIMIT_BYTES:
        raise HTTPException(status_code=413, detail="验收文件过大")
    try:
        media = file.content_type or ""
        extension = "jpg" if "jpeg" in media else "pdf" if "pdf" in media else "png"
        path = store.save_binary_export(name, content, extension)
    except ResourceError as error:
        raise _http_error(error) from error
    return {"status": "saved", "path": str(path.relative_to(store.root)).replace("\\", "/")}
