"""Thin wrapper over the Anthropic SDK: PDF blocks, plain text calls, validated JSON calls."""
import base64
import json
import re
from typing import Optional, TypeVar

from anthropic import AsyncAnthropic
from pydantic import BaseModel, ValidationError

import config

T = TypeVar("T", bound=BaseModel)
_client: Optional[AsyncAnthropic] = None


def client() -> AsyncAnthropic:
    global _client
    if not config.API_KEY:
        raise RuntimeError("ANTHROPIC_API_KEY is not set in backend/.env")
    if _client is None:
        headers = {"anthropic-workspace-id": config.WORKSPACE_ID} if config.WORKSPACE_ID else None
        _client = AsyncAnthropic(api_key=config.API_KEY, timeout=config.TIMEOUT, max_retries=1,
                                 default_headers=headers)
    return _client


def pdf_blocks(files: list[tuple[str, bytes]]) -> list[dict]:
    """PDFs as document blocks; cache the last one so later stages reuse the prompt cache."""
    blocks = [
        {
            "type": "document",
            "title": name,
            "source": {"type": "base64", "media_type": "application/pdf",
                       "data": base64.standard_b64encode(data).decode()},
        }
        for name, data in files
    ]
    if blocks:
        blocks[-1]["cache_control"] = {"type": "ephemeral"}
    return blocks


def _text(resp) -> str:
    return "".join(getattr(b, "text", "") for b in resp.content if getattr(b, "type", "") == "text").strip()


def extract_json(text: str) -> str:
    m = re.search(r"```(?:json)?\s*(\{.*\})\s*```", text, re.S)
    if m:
        return m.group(1)
    s, e = text.find("{"), text.rfind("}")
    if s == -1 or e <= s:
        raise ValueError("no JSON object in model output")
    return text[s:e + 1]


async def ask_text(model: str, system: str, content: list[dict], max_tokens: int = 6000) -> str:
    resp = await client().messages.create(
        model=model, max_tokens=max_tokens, system=system,
        messages=[{"role": "user", "content": content}],
    )
    if getattr(resp, "stop_reason", None) == "refusal":
        raise RuntimeError("model declined the request")
    return _text(resp)


async def ask_json(model: str, system: str, content: list[dict], schema: type[T], max_tokens: int = 16000) -> T:
    """Ask for JSON, validate with Pydantic, retry once with the error message."""
    sys = (system + "\n\nReturn ONLY one JSON object (no prose, no markdown fences) "
           "that validates against this JSON Schema:\n" + json.dumps(schema.model_json_schema()))
    err: Exception = RuntimeError("no attempt")
    for attempt in range(2):
        msg = list(content)
        if attempt:
            msg.append({"type": "text", "text": f"Your previous answer was invalid ({str(err)[:400]}). Return only the corrected JSON object."})
        text = await ask_text(model, sys, msg, max_tokens)
        try:
            return schema.model_validate_json(extract_json(text))
        except (ValidationError, ValueError) as e:
            err = e
    raise err
