"""Case store + the AI stages (A extract, C investigate, D letter, E translate) + demo replay."""
import asyncio
import json
import uuid
from dataclasses import dataclass, field
from typing import AsyncIterator, Optional

import config
import prompts
from claude_client import ask_json, ask_text, pdf_blocks
from dates import compute
from schemas import Computed, Facts, Investigation

RULES = json.loads(config.RULES_FILE.read_text(encoding="utf-8"))
LANGS = {"hi": "Hindi (Devanagari script)", "mr": "Marathi (Devanagari script)"}


# ---------------------------------------------------------------- store
@dataclass
class Case:
    id: str
    files: list[tuple[str, bytes]]
    sample: Optional[str] = None          # case01..case04 when a sample was used
    facts: Optional[Facts] = None
    computed: Optional[Computed] = None
    investigation: Optional[Investigation] = None
    letters: dict = field(default_factory=dict)
    replay: bool = False


CASES: dict[str, Case] = {}


def new_case(files: list[tuple[str, bytes]], sample: Optional[str] = None) -> Case:
    c = Case(id=uuid.uuid4().hex[:10], files=files, sample=sample)
    CASES[c.id] = c
    return c


def load_sample(sample: str) -> list[tuple[str, bytes]]:
    folder = config.SAMPLES / sample
    if not folder.is_dir():
        raise FileNotFoundError(sample)
    return [(p.name, p.read_bytes()) for p in sorted(folder.glob("*.pdf"))]


def demo_data(sample: Optional[str]) -> dict:
    path = config.DEMO / f"{sample or 'case01'}.json"
    if not path.exists():
        path = config.DEMO / "case01.json"
    return json.loads(path.read_text(encoding="utf-8"))


# ---------------------------------------------------------------- stages
async def extract_facts(case: Case) -> Facts:
    content = pdf_blocks(case.files) + [{"type": "text", "text": "Extract the facts from these documents."}]
    return await ask_json(config.SONNET, prompts.EXTRACT, content, Facts, max_tokens=8000)


async def investigate(case: Case) -> Investigation:
    payload = {
        "FACTS": case.facts.model_dump(),
        "COMPUTED": case.computed.model_dump(),
        "RULES": RULES,
    }
    content = pdf_blocks(case.files) + [{"type": "text", "text": json.dumps(payload, ensure_ascii=False, indent=1)}]
    return await ask_json(config.OPUS, prompts.INVESTIGATE, content, Investigation, max_tokens=24000)


async def draft_letter(case: Case) -> str:
    fails = [c.model_dump() for c in case.investigation.checks if c.status == "fail"]
    payload = {"FACTS": case.facts.model_dump(), "COMPUTED": case.computed.model_dump(),
               "FAILED_CHECKS": fails, "HEADLINE": case.investigation.headline}
    content = [{"type": "text", "text": json.dumps(payload, ensure_ascii=False, indent=1)}]
    return await ask_text(config.SONNET, prompts.LETTER, content, max_tokens=4000)


async def translate(text: str, lang: str, gender: str) -> str:
    sys = prompts.TRANSLATE.format(language=LANGS[lang], gender=gender if gender != "unknown" else "of unknown gender (use neutral forms)")
    return await ask_text(config.SONNET, sys, [{"type": "text", "text": text}], max_tokens=6000)


async def get_letter(case: Case, lang: str) -> str:
    if lang in case.letters:
        return case.letters[lang]
    if case.replay or config.FORCE_DEMO or not config.API_KEY:
        text = demo_data(case.sample).get("letters", {}).get(lang, "")
    elif lang == "en":
        text = await draft_letter(case)
    else:
        text = await translate(await get_letter(case, "en"), lang, case.facts.gender)
    case.letters[lang] = text
    return text


# ---------------------------------------------------------------- SSE event streams
def ev(name: str, data) -> dict:
    if hasattr(data, "model_dump"):
        data = data.model_dump()
    return {"event": name, "data": json.dumps(data, ensure_ascii=False, default=str)}


async def live_events(case: Case) -> AsyncIterator[dict]:
    yield ev("step", {"stage": 0, "label": "Reading documents"})
    case.facts = await extract_facts(case)
    yield ev("facts", case.facts)
    yield ev("step", {"stage": 1, "label": "Calculating dates"})
    case.computed = compute(case.facts)
    yield ev("computed", case.computed)
    yield ev("step", {"stage": 2, "label": "Checking IRDAI rules"})
    case.investigation = await investigate(case)
    for c in case.investigation.checks:
        yield ev("check", c)
        await asyncio.sleep(0.45)
    yield ev("step", {"stage": 3, "label": "Verdict"})
    yield ev("verdict", {**case.investigation.model_dump(), "replay": False})


async def replay_events(case: Case) -> AsyncIterator[dict]:
    """Saved results, same events and pacing as live. Used for ?demo=1 and as the fail-safe."""
    d = demo_data(case.sample)
    case.replay = True
    case.facts = Facts(**d["facts"])
    case.computed = compute(case.facts)
    case.investigation = Investigation(**d["investigation"])
    yield ev("step", {"stage": 0, "label": "Reading documents"})
    await asyncio.sleep(1.6)
    yield ev("facts", case.facts)
    await asyncio.sleep(0.6)
    yield ev("step", {"stage": 1, "label": "Calculating dates"})
    yield ev("computed", case.computed)
    await asyncio.sleep(0.6)
    yield ev("step", {"stage": 2, "label": "Checking IRDAI rules"})
    await asyncio.sleep(1.4)
    for c in case.investigation.checks:
        yield ev("check", c)
        await asyncio.sleep(0.7)
    yield ev("step", {"stage": 3, "label": "Verdict"})
    yield ev("verdict", {**case.investigation.model_dump(), "replay": True})


async def investigate_stream(case: Case, demo: bool) -> AsyncIterator[dict]:
    if demo or config.FORCE_DEMO or not config.API_KEY:
        async for e in replay_events(case):
            yield e
        yield ev("done", {})
        return
    try:
        async for e in live_events(case):
            yield e
    except Exception as exc:  # any API / parse / timeout failure -> saved replay
        print(f"[claimsathi] live run failed for {case.id}: {exc!r}")
        yield ev("notice", {"message": "Live AI unavailable, showing the saved replay for this case.",
                            "detail": str(exc)[:300]})
        async for e in replay_events(case):
            yield e
    yield ev("done", {})
