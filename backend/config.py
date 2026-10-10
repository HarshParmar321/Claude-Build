"""Central settings. Values come from backend/.env (never committed)."""
import os
from pathlib import Path

from dotenv import load_dotenv

BASE = Path(__file__).resolve().parent
load_dotenv(BASE / ".env")

API_KEY = os.getenv("ANTHROPIC_API_KEY", "").strip()
OPUS = os.getenv("OPUS_MODEL", "claude-opus-5-5")
SONNET = os.getenv("SONNET_MODEL", "claude-sonnet-5-5")
TIMEOUT = float(os.getenv("CLAUDE_TIMEOUT", "150"))
# FORCE_DEMO=1 replays saved results for every request (no API calls).
FORCE_DEMO = os.getenv("FORCE_DEMO", "0") == "1"

DATA = BASE / "data"
SAMPLES = DATA / "samples"
DEMO = DATA / "demo"
RULES_FILE = DATA / "irdai_rules.json"
FRONTEND = BASE.parent / "frontend"

MAX_FILES = 6
MAX_FILE_MB = 10
