from datetime import datetime, timezone

from pydantic import BaseModel, Field
from pydantic import field_validator


def _normalize_timestamp(value: str | None) -> str | None:
    if value is None:
        return None

    raw = value.strip()
    if not raw:
        return None

    normalized = raw.replace("Z", "+00:00")
    parsed = datetime.fromisoformat(normalized)
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    else:
        parsed = parsed.astimezone(timezone.utc)
    return parsed.isoformat().replace("+00:00", "Z")


class SessionIn(BaseModel):
    session_id: str = Field(min_length=1)
    user_id: str = Field(default="unknown", min_length=1)
    title: str | None = None
    started_at: str | None = None
    ended_at: str | None = None

    total_input_tokens: int = 0
    total_output_tokens: int = 0
    total_cached_tokens: int = 0
    total_tokens: int = 0
    total_nano_aiu: int = 0
    total_duration_ms: int = 0
    model_turn_count: int = 0
    tool_call_count: int = 0

    raw_payload: dict = Field(default_factory=dict)

    @field_validator("started_at", "ended_at", mode="before")
    @classmethod
    def normalize_timestamps(cls, value: str | None) -> str | None:
        return _normalize_timestamp(value)


class SessionOut(BaseModel):
    session_id: str
    user_id: str
    title: str | None
    started_at: str | None
    ended_at: str | None

    total_input_tokens: int
    total_output_tokens: int
    total_cached_tokens: int
    total_tokens: int
    total_nano_aiu: int
    total_duration_ms: int
    model_turn_count: int
    tool_call_count: int

    model_config = {"from_attributes": True}


class SummaryOut(BaseModel):
    total_sessions: int
    distinct_users: int
    total_input_tokens: int
    total_output_tokens: int
    total_cached_tokens: int
    total_tokens: int
    total_nano_aiu: int
    total_ai_credits: float       # nano_aiu / 1_000_000_000
    total_cost_usd: float         # total_ai_credits * 0.01
    total_duration_ms: int
    total_model_turns: int
    total_tool_calls: int


class UserItem(BaseModel):
    user_id: str


# ── Spend summary (date-grouped) ────────────────────────────────────────────

class SpendDateOut(BaseModel):
    date: str
    session_count: int
    total_input_tokens: int
    total_output_tokens: int
    total_cached_tokens: int
    total_tokens: int
    total_nano_aiu: int
    total_ai_credits: float
    total_cost_usd: float
    model_turn_count: int
    tool_call_count: int


# ── Model-level usage ────────────────────────────────────────────────────────

class ModelUsageIn(BaseModel):
    session_id: str | None = None
    date: str                                  # YYYY-MM-DD
    user_id: str = Field(default="unknown", min_length=1)
    model: str = Field(min_length=1)
    nano_aiu: int = 0
    input_tokens: int = 0
    output_tokens: int = 0
    session_count: int = 0
    request_count: int = 0

    @field_validator("date", mode="before")
    @classmethod
    def normalize_date(cls, value: str) -> str:
        if value is None:
            raise ValueError("date is required")
        raw = str(value).strip()
        if not raw:
            raise ValueError("date is required")

        # Accept either YYYY-MM-DD or ISO timestamp and normalize to YYYY-MM-DD.
        if "T" in raw:
            ts = _normalize_timestamp(raw)
            assert ts is not None
            return ts[:10]

        parsed = datetime.fromisoformat(raw)
        return parsed.date().isoformat()


class ModelUsageOut(BaseModel):
    date: str
    user_id: str
    model: str
    nano_aiu: int
    input_tokens: int
    output_tokens: int
    session_count: int
    request_count: int
    ai_credits: float


class ModelItem(BaseModel):
    model: str


class SessionsPageOut(BaseModel):
    items: list[SessionOut]
    page: int
    page_size: int
    total: int
    total_pages: int


class ModelUsagePageOut(BaseModel):
    items: list[ModelUsageOut]
    page: int
    page_size: int
    total: int
    total_pages: int
