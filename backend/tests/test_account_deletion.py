"""Account deletion: removing the Supabase auth identity. httpx is stubbed —
these cover how Impulse reacts to each outcome, not Supabase itself."""
import pytest
from fastapi import HTTPException

from routers import users


class _Resp:
    def __init__(self, status_code, text=""):
        self.status_code = status_code
        self.text = text


def _stub_delete(monkeypatch, status_code):
    calls = []

    def fake_delete(url, headers, timeout):
        calls.append((url, headers))
        return _Resp(status_code)

    monkeypatch.setattr(users.httpx, "delete", fake_delete)
    return calls


def test_deletes_auth_user_with_service_role(monkeypatch):
    monkeypatch.setattr(users, "SUPABASE_SERVICE_ROLE_KEY", "srk")
    calls = _stub_delete(monkeypatch, 200)
    users._delete_auth_user("u1")
    url, headers = calls[0]
    assert url.endswith("/auth/v1/admin/users/u1")
    assert headers["Authorization"] == "Bearer srk"


def test_already_deleted_auth_user_is_fine(monkeypatch):
    """A retry after a partial failure must finish cleanly."""
    monkeypatch.setattr(users, "SUPABASE_SERVICE_ROLE_KEY", "srk")
    _stub_delete(monkeypatch, 404)
    users._delete_auth_user("u1")


def test_supabase_error_is_a_502(monkeypatch):
    monkeypatch.setattr(users, "SUPABASE_SERVICE_ROLE_KEY", "srk")
    _stub_delete(monkeypatch, 500)
    with pytest.raises(HTTPException) as exc:
        users._delete_auth_user("u1")
    assert exc.value.status_code == 502


def test_missing_service_role_key_is_a_503_without_calling_out(monkeypatch):
    monkeypatch.setattr(users, "SUPABASE_SERVICE_ROLE_KEY", None)
    calls = _stub_delete(monkeypatch, 200)
    with pytest.raises(HTTPException) as exc:
        users._delete_auth_user("u1")
    assert exc.value.status_code == 503
    assert calls == []
