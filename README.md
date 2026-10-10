# ClaimSathi

**Your claim was rejected. Let's check if that was fair.**

ClaimSathi reads an Indian health-insurance policy, the insurer's rejection letter and the hospital papers, checks the rejection against the policy and IRDAI rules, and drafts an appeal letter in English, Hindi or Marathi.

> Opus 5.5 investigates · Sonnet 5.5 writes
> Built for the Claude Opus 5.5 × Sonnet 5.5 Build Day, Mumbai.

## Status

| Part | State |
| --- | --- |
| `prototype/index.html` | Clickable HTML prototype of all 3 screens with the 4 sample cases (no AI calls) |
| `backend/` (FastAPI) | To build at the event: see the SRS |
| `frontend/` (Next.js) | To build at the event: see the SRS |

## Try the prototype

Open `prototype/index.html` in any browser. No install, no internet needed.

- Click a sample case (e.g. **Heart attack ₹2,37,000**) to watch the investigation.
- On the verdict screen, click **Draft appeal letter**, then switch to **हिंदी** or **मराठी**.
- Deep links: `#/investigate/case01`, `#/result/case04`.

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

## Planned stack

Python 3.11 · FastAPI · Anthropic Python SDK (`claude-opus-5-5`, `claude-sonnet-5-5`) · Pydantic · sse-starlette · Next.js 15 · Tailwind · shadcn/ui

## Disclaimer

ClaimSathi helps you understand and draft. It is not legal advice.
