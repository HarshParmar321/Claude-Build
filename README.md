# ClaimSathi

**Your claim was rejected. Let's check if that was fair.**

ClaimSathi reads an Indian health-insurance policy, the insurer's rejection letter and the hospital papers, checks the rejection against the policy and IRDAI rules, and drafts an appeal letter in English, Hindi or Marathi.

> Opus 5.5 investigates · Sonnet 5.5 writes
> Built for the Claude Opus 5.5 × Sonnet 5.5 Build Day, Mumbai.

## Run it (one command, one port)

```bash
cd backend
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env          # then paste your ANTHROPIC_API_KEY into .env
uvicorn main:app --reload --port 8000
```

Open **http://localhost:8000**. FastAPI serves the API and the frontend.

| Mode | How | What happens |
| --- | --- | --- |
| Live | API key in `backend/.env` | Sonnet 5.5 extracts → Python date math → Opus 5.5 investigates → Sonnet writes/translates letters |
| Demo replay | open `http://localhost:8000/?demo=1`, or `FORCE_DEMO=1` in `.env` | Saved results with the same animation. No internet needed. |
| Auto fail-safe | any API error/timeout | Shows a notice and plays the saved replay for that case |

Check the setup: http://localhost:8000/api/health · API docs: http://localhost:8000/docs

### Test against the answer key (live)

```bash
cd backend
python scripts/eval_cases.py            # all 4 cases, prints PASS/FAIL per case
python scripts/eval_cases.py case01     # one case
python scripts/eval_cases.py --save     # also save real outputs as the demo replays
```

## Layout

| Path | What |
| --- | --- |
| `backend/main.py` | FastAPI routes: `POST /api/cases`, `GET /api/investigate/{id}` (SSE), `GET /api/cases/{id}`, `POST /api/letter`, `GET /api/health` |
| `backend/pipeline.py` | Case store, AI stages A/C/D/E, live + replay event streams |
| `backend/prompts.py` | System prompts |
| `backend/schemas.py` | Pydantic models (Facts, Computed, Check, Investigation) |
| `backend/dates.py` | Months of cover, stay length, deadlines (Python, not the model) |
| `backend/claude_client.py` | Anthropic SDK wrapper: PDF blocks, JSON validation + 1 retry |
| `backend/data/irdai_rules.json` | The 9 rules R1–R9 |
| `backend/data/demo/` | Saved replays for case01–04 |
| `frontend/` | `index.html` + `app.js` (served by FastAPI) |
| `prototype/` | Original static prototype (no backend) |

## Sample data

`backend/data/samples/case01..04/` holds fictional, watermarked PDFs (policy wording, schedule, rejection letter, discharge summary + bill).
`backend/data/expected_verdicts.json` and `docs/ANSWER_KEY_ClaimSathi_Demo.pdf` list what the tool must find.

| Case | Claim | Insurer's mistake | Expected |
| --- | --- | --- | --- |
| 01 | Heart attack, ₹2,37,000 | Non-disclosure after 85 months (moratorium) | STRONG CASE |
| 02 | Cataract, ₹48,500 | 24-hour rule on a Day Care procedure | STRONG CASE |
| 03 | BP emergency, ₹1,31,000 | 48-month PED wait; policy says 36 | STRONG CASE |
| 04 | Knee replacement, ₹3,02,000 | None: 24-month wait not complete | VALID REJECTION |

All names, organisations and numbers are fictional.

## Stack

Python 3.10+ · FastAPI · Anthropic Python SDK (`claude-opus-5-5`, `claude-sonnet-5-5`) · Pydantic · sse-starlette · plain HTML/CSS/JS frontend served by FastAPI

## Disclaimer

ClaimSathi helps you understand and draft. It is not legal advice.
