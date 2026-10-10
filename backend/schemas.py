"""Pydantic models shared by the API, the prompts and the demo files."""
from typing import Literal, Optional

from pydantic import BaseModel, Field

RejectionCategory = Literal[
    "non_disclosure", "ped_waiting", "specified_disease_waiting", "initial_waiting",
    "less_than_24_hours", "documents", "exclusion", "sub_limit", "other",
]


class Facts(BaseModel):
    """Stage A output: what the documents say. Dates as ISO strings."""
    patient_name: Optional[str] = None
    gender: Literal["male", "female", "unknown"] = "unknown"
    policy_number: Optional[str] = None
    claim_number: Optional[str] = None
    insurer_name: Optional[str] = None
    hospital_name: Optional[str] = None
    sum_insured_inr: Optional[int] = None
    first_inception_date: Optional[str] = Field(None, description="YYYY-MM-DD, first policy with this insurer (continuous cover start)")
    current_period: Optional[str] = None
    peds_declared: list[str] = []
    admission_datetime: Optional[str] = Field(None, description="YYYY-MM-DDTHH:MM")
    discharge_datetime: Optional[str] = Field(None, description="YYYY-MM-DDTHH:MM")
    diagnosis: Optional[str] = None
    procedure: Optional[str] = None
    amount_claimed_inr: Optional[int] = None
    rejection_date: Optional[str] = Field(None, description="YYYY-MM-DD")
    rejection_reason: Optional[str] = Field(None, description="Insurer's reason in one plain sentence")
    rejection_category: RejectionCategory = "other"
    clause_cited: Optional[str] = Field(None, description="Clause number/name exactly as the letter cites it, null if none")
    waiting_period_months_in_letter: Optional[int] = None
    letter_mentions_claims_review_committee: bool = False
    letter_mentions_grievance_or_ombudsman: bool = False
    fraud_alleged: bool = False
    documents_found: list[str] = Field([], description="Which document types were found, e.g. policy wording, schedule, rejection letter, discharge summary, bill")


class Computed(BaseModel):
    """Stage B output: date math done in Python, never by the model."""
    months_of_cover: Optional[int] = None
    months_label: str = "not found"
    stay_hours: Optional[float] = None
    stay_label: str = "not found"
    today: str
    appeal_reply_due: str
    ombudsman_deadline: str


class Check(BaseModel):
    rule_id: str
    title: str
    status: Literal["pass", "fail", "not_applicable"]
    finding: str
    policy_quote: Optional[str] = None
    policy_clause: Optional[str] = None
    page: Optional[int] = None
    regulation: Optional[str] = None
    severity: Literal["critical", "major", "minor"] = "minor"


class Investigation(BaseModel):
    verdict: Literal["STRONG_CASE", "CONTESTABLE", "VALID_REJECTION"]
    confidence: Literal["high", "medium", "low"]
    headline: str
    amount_at_stake_inr: int = 0
    checks: list[Check]
    next_steps: list[str] = []


class LetterRequest(BaseModel):
    case_id: str
    lang: Literal["en", "hi", "mr"] = "en"
