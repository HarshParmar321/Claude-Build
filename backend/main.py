"""ClaimSathi API. Run from backend/:  uvicorn main:app --reload --port 8000
Then open http://localhost:8000 (the frontend is served from ../frontend)."""
from typing import Optional

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from sse_starlette.sse import EventSourceResponse

import config
from pipeline import CASES, get_letter, investigate_stream, load_sample, new_case
from schemas import LetterRequest

app = FastAPI(title="ClaimSathi API", version="0.1.0")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

SAMPLE_IDS = {"case01", "case02", "case03", "case04"}


@app.get("/api/health")
def health():
    return {"ok": True, "has_api_key": bool(config.API_KEY), "force_demo": config.FORCE_DEMO,
            "models": {"investigate": config.OPUS, "extract_write": config.SONNET}}


@app.post("/api/cases")
async def create_case(sample_case: Optional[str] = Form(None), files: Optional[list[UploadFile]] = File(None)):
    if sample_case:
        if sample_case not in SAMPLE_IDS:
            raise HTTPException(400, "Unknown sample case")
        case = new_case(load_sample(sample_case), sample=sample_case)
        return {"case_id": case.id, "sample": sample_case}

    files = files or []
    if not files:
        raise HTTPException(400, "Upload at least one PDF or choose a sample case")
    if len(files) > config.MAX_FILES:
        raise HTTPException(400, f"Upload at most {config.MAX_FILES} PDFs")
    loaded = []
    for f in files:
        data = await f.read()
        if not (f.filename or "").lower().endswith(".pdf") or not data.startswith(b"%PDF"):
            raise HTTPException(400, f"{f.filename}: PDF files only")
        if len(data) > config.MAX_FILE_MB * 1024 * 1024:
            raise HTTPException(400, f"{f.filename}: larger than {config.MAX_FILE_MB} MB")
        loaded.append((f.filename, data))
    case = new_case(loaded)
    return {"case_id": case.id, "sample": None}


@app.get("/api/investigate/{case_id}")
async def investigate(case_id: str, demo: int = 0):
    case = CASES.get(case_id)
    if not case:
        raise HTTPException(404, "Case not found")
    return EventSourceResponse(investigate_stream(case, bool(demo)), ping=10)


@app.get("/api/cases/{case_id}")
def get_case(case_id: str):
    case = CASES.get(case_id)
    if not case or not case.investigation:
        raise HTTPException(404, "No result for this case yet")
    return {"case_id": case.id, "sample": case.sample, "replay": case.replay,
            "facts": case.facts.model_dump(), "computed": case.computed.model_dump(),
            "investigation": case.investigation.model_dump()}


@app.post("/api/letter")
async def letter(req: LetterRequest):
    case = CASES.get(req.case_id)
    if not case or not case.investigation:
        raise HTTPException(404, "Investigate the case first")
    try:
        text = await get_letter(case, req.lang)
    except Exception as exc:
        print(f"[claimsathi] letter failed: {exc!r}")
        from pipeline import demo_data
        text = demo_data(case.sample).get("letters", {}).get(req.lang, "")
        if not text:
            raise HTTPException(502, "Could not write the letter right now. Try again.")
    return {"lang": req.lang, "text": text}


# Frontend (served last so /api/* wins)
if config.FRONTEND.is_dir():
    app.mount("/", StaticFiles(directory=config.FRONTEND, html=True), name="frontend")
