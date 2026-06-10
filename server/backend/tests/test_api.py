import importlib
import sys

from fastapi.testclient import TestClient


def _fresh_client(monkeypatch, tmp_path, auth_required=True):
    db_path = tmp_path / "test.db"
    monkeypatch.setenv("DB_PATH", str(db_path))
    monkeypatch.setenv("APP_ENV", "test")
    monkeypatch.setenv("API_AUTH_REQUIRED", "true" if auth_required else "false")
    monkeypatch.setenv("API_AUTH_TOKEN", "test-token")
    monkeypatch.setenv("CORS_ALLOWED_ORIGINS", "http://localhost:5173")

    # Reimport modules so globals (engine/config/app) are rebuilt with fresh env vars.
    for module_name in ["app.main", "app.database", "app.migrations"]:
        if module_name in sys.modules:
            del sys.modules[module_name]

    main_mod = importlib.import_module("app.main")
    importlib.reload(main_mod)
    return TestClient(main_mod.app)


def _auth_headers():
    return {"Authorization": "Bearer test-token"}


def _session_payload(session_id, user_id="alex", started_at="2026-06-10T10:00:00Z"):
    return {
        "session_id": session_id,
        "user_id": user_id,
        "title": f"Session {session_id}",
        "started_at": started_at,
        "ended_at": "2026-06-10T10:10:00Z",
        "total_input_tokens": 100,
        "total_output_tokens": 50,
        "total_cached_tokens": 10,
        "total_tokens": 160,
        "total_nano_aiu": 1230000000,
        "total_duration_ms": 1000,
        "model_turn_count": 2,
        "tool_call_count": 1,
        "raw_payload": {"source": "test"},
    }


def _model_usage_payload(date="2026-06-10", user_id="alex", model="gpt-4o", nano_aiu=1000000000):
    return {
        "session_id": "s-model",
        "date": date,
        "user_id": user_id,
        "model": model,
        "nano_aiu": nano_aiu,
        "input_tokens": 10,
        "output_tokens": 5,
        "session_count": 1,
        "request_count": 1,
    }


def test_auth_required_for_write_endpoints(monkeypatch, tmp_path):
    client = _fresh_client(monkeypatch, tmp_path, auth_required=True)

    response = client.post("/api/v1/sessions", json=_session_payload("unauth-1"))

    assert response.status_code == 401
    payload = response.json()
    assert payload["error"]["code"] == "unauthorized"


def test_single_upsert_and_summary(monkeypatch, tmp_path):
    client = _fresh_client(monkeypatch, tmp_path)

    post_response = client.post("/api/v1/sessions", json=_session_payload("single-1"), headers=_auth_headers())
    assert post_response.status_code == 200

    sessions_response = client.get("/api/v1/sessions", params={"days": 0})
    assert sessions_response.status_code == 200
    sessions = sessions_response.json()
    assert sessions["total"] == 1
    assert sessions["items"][0]["session_id"] == "single-1"

    summary_response = client.get("/api/v1/summary", params={"days": 0})
    summary = summary_response.json()
    assert summary["total_sessions"] == 1
    assert summary["total_input_tokens"] == 100


def test_batch_upsert_idempotent(monkeypatch, tmp_path):
    client = _fresh_client(monkeypatch, tmp_path)

    payload = [_session_payload("batch-1"), _session_payload("batch-2")]
    first = client.post("/api/v1/sessions/batch", json=payload, headers=_auth_headers())
    assert first.status_code == 200

    # Replay with updated values for one key to validate idempotent update semantics.
    updated = _session_payload("batch-1")
    updated["total_input_tokens"] = 999
    second = client.post("/api/v1/sessions/batch", json=[updated], headers=_auth_headers())
    assert second.status_code == 200

    sessions = client.get("/api/v1/sessions", params={"days": 0, "page_size": 10}).json()
    assert sessions["total"] == 2
    found = {item["session_id"]: item for item in sessions["items"]}
    assert found["batch-1"]["total_input_tokens"] == 999


def test_date_user_model_filtering(monkeypatch, tmp_path):
    client = _fresh_client(monkeypatch, tmp_path)

    client.post("/api/v1/model-usage", json=_model_usage_payload(user_id="alex", model="gpt-4o"), headers=_auth_headers())
    client.post("/api/v1/model-usage", json=_model_usage_payload(user_id="sam", model="gpt-4.1"), headers=_auth_headers())

    filtered = client.get(
        "/api/v1/model-usage",
        params={"days": 0, "user_id": "alex", "model": "gpt-4o"},
    )
    assert filtered.status_code == 200
    body = filtered.json()
    assert body["total"] == 1
    assert body["items"][0]["user_id"] == "alex"
    assert body["items"][0]["model"] == "gpt-4o"


def test_pagination_and_all_time_semantics(monkeypatch, tmp_path):
    client = _fresh_client(monkeypatch, tmp_path)

    old_session = _session_payload("old-1", started_at="2020-01-01T00:00:00Z")
    new_session = _session_payload("new-1", started_at="2026-06-10T00:00:00Z")
    client.post("/api/v1/sessions", json=old_session, headers=_auth_headers())
    client.post("/api/v1/sessions", json=new_session, headers=_auth_headers())

    recent = client.get("/api/v1/sessions", params={"days": 30, "page": 1, "page_size": 1}).json()
    assert recent["total"] == 1
    assert recent["total_pages"] == 1

    all_time = client.get("/api/v1/sessions", params={"days": 0, "page": 1, "page_size": 1}).json()
    assert all_time["total"] == 2
    assert all_time["total_pages"] == 2
