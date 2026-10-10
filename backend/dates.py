"""Stage B: all date math in Python so the numbers on screen are always right."""
from datetime import date, datetime, timedelta
from typing import Optional

from dateutil import parser
from dateutil.relativedelta import relativedelta

from schemas import Computed, Facts


def parse_dt(s: Optional[str]) -> Optional[datetime]:
    """ISO first (what we ask the model for); fall back to Indian day-first formats."""
    if not s:
        return None
    s = s.strip().replace("Z", "")
    try:
        return datetime.fromisoformat(s)
    except ValueError:
        pass
    try:
        return parser.parse(s, dayfirst=True)
    except (ValueError, OverflowError):
        return None


def months_of_cover(first_inception: date, admission: date) -> int:
    d = relativedelta(admission, first_inception)
    return d.years * 12 + d.months


def stay_label(hours: float) -> str:
    if hours < 24:
        h = int(hours)
        m = round((hours - h) * 60)
        return f"{h} h {m} min" if m else f"{h} h"
    days = int(hours // 24)
    rem = int(round(hours - days * 24))
    return f"{days} day{'s' if days > 1 else ''}" + (f" {rem} h" if rem else "")


def fmt(d: date) -> str:
    return d.strftime("%d %b %Y")


def compute(facts: Facts, today: Optional[date] = None) -> Computed:
    today = today or date.today()
    inc = parse_dt(facts.first_inception_date)
    adm = parse_dt(facts.admission_datetime)
    dis = parse_dt(facts.discharge_datetime)

    months = months_of_cover(inc.date(), adm.date()) if inc and adm else None
    hours = round((dis - adm).total_seconds() / 3600, 2) if adm and dis and dis >= adm else None

    return Computed(
        months_of_cover=months,
        months_label=f"{months} months" if months is not None else "not found",
        stay_hours=hours,
        stay_label=stay_label(hours) if hours is not None else "not found",
        today=fmt(today),
        appeal_reply_due=fmt(today + timedelta(days=30)),
        ombudsman_deadline=fmt(today + timedelta(days=30 + 365)),
    )
