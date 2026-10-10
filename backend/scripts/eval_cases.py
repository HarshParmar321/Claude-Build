"""Run the LIVE pipeline on the 4 sample cases and compare with data/expected_verdicts.json.

    cd backend && python scripts/eval_cases.py            # all cases
    cd backend && python scripts/eval_cases.py case01     # one case
    cd backend && python scripts/eval_cases.py --save     # also overwrite data/demo/*.json with real outputs
"""
import asyncio
import json
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import config  # noqa: E402
from dates import compute  # noqa: E402
from pipeline import extract_facts, get_letter, investigate, load_sample, new_case  # noqa: E402

EXPECTED = {f"case{e['case']}": e for e in json.loads((config.DATA / "expected_verdicts.json").read_text(encoding="utf-8"))}
MUST_FAIL = {"case01": {"R1"}, "case02": {"R4"}, "case03": {"R2"}, "case04": set()}
MONTHS = {"case01": 85, "case02": 44, "case03": 46, "case04": 6}


async def run(cid: str, save: bool) -> bool:
    t = time.time()
    case = new_case(load_sample(cid), sample=cid)
    case.facts = await extract_facts(case)
    case.computed = compute(case.facts)
    case.investigation = await investigate(case)
    inv = case.investigation
    fails = {c.rule_id for c in inv.checks if c.status == "fail"}
    want = EXPECTED[cid]["expected_verdict"].replace(" ", "_")
    ok_verdict = inv.verdict == want
    ok_months = case.computed.months_of_cover == MONTHS[cid]
    ok_fails = MUST_FAIL[cid] <= fails
    ok = ok_verdict and ok_months and ok_fails
    print(f"{'PASS' if ok else 'FAIL'} {cid}  verdict={inv.verdict} (want {want})  months={case.computed.months_of_cover} "
          f"(want {MONTHS[cid]})  fails={sorted(fails)} (must include {sorted(MUST_FAIL[cid])})  {time.time() - t:.0f}s")
    print(f"     headline: {inv.headline}")
    if save:
        letters = {}
        if inv.verdict != "VALID_REJECTION":
            for lang in ("en", "hi", "mr"):
                letters[lang] = await get_letter(case, lang)
        out = {"note": "Real model output saved by scripts/eval_cases.py --save",
               "facts": case.facts.model_dump(), "investigation": inv.model_dump(), "letters": letters}
        (config.DEMO / f"{cid}.json").write_text(json.dumps(out, ensure_ascii=False, indent=1), encoding="utf-8")
        print(f"     saved data/demo/{cid}.json")
    return ok


async def main():
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    save = "--save" in sys.argv
    if not config.API_KEY:
        sys.exit("Set ANTHROPIC_API_KEY in backend/.env first")
    cases = args or ["case01", "case02", "case03", "case04"]
    results = [await run(c, save) for c in cases]
    print(f"\n{sum(results)}/{len(results)} cases match the answer key")


if __name__ == "__main__":
    asyncio.run(main())
