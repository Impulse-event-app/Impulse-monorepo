"""Sign in with Apple token storage and revocation (App Store 5.1.1(v)).
Apple's HTTP endpoints and the database are stubbed — these cover what Impulse
sends Apple and how it reacts to each outcome, not Apple itself."""
import pytest
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import ec
from fastapi import FastAPI
from fastapi.testclient import TestClient
from jose import jwt

import apple_auth
from auth import get_current_user
from database import get_db
from models import User, Venue
from routers import users

UID = "11111111-1111-1111-1111-111111111111"


def _pem():
    key = ec.generate_private_key(ec.SECP256R1())
    private = key.private_bytes(
        serialization.Encoding.PEM, serialization.PrivateFormat.PKCS8, serialization.NoEncryption(),
    ).decode()
    public = key.public_key().public_bytes(
        serialization.Encoding.PEM, serialization.PublicFormat.SubjectPublicKeyInfo,
    ).decode()
    return private, public


@pytest.fixture
def apple_env(monkeypatch):
    private, public = _pem()
    monkeypatch.setenv("APPLE_TEAM_ID", "TEAM123456")
    monkeypatch.setenv("APPLE_KEY_ID", "KEY1234567")
    # Escaped newlines, as a dashboard env var often stores them.
    monkeypatch.setenv("APPLE_PRIVATE_KEY", private.replace("\n", "\\n"))
    monkeypatch.delenv("APPLE_CLIENT_ID", raising=False)
    return public


@pytest.fixture
def no_apple_env(monkeypatch):
    for name in ("APPLE_TEAM_ID", "APPLE_KEY_ID", "APPLE_PRIVATE_KEY", "APPLE_CLIENT_ID"):
        monkeypatch.delenv(name, raising=False)


class _Resp:
    def __init__(self, status_code, payload=None, text=""):
        self.status_code = status_code
        self._payload = payload or {}
        self.text = text

    def json(self):
        return self._payload


def _stub_post(monkeypatch, resp):
    calls = []

    def fake_post(url, data, timeout):
        calls.append((url, data))
        if isinstance(resp, Exception):
            raise resp
        return resp

    monkeypatch.setattr(apple_auth.httpx, "post", fake_post)
    return calls


# ── Client secret ─────────────────────────────────────────────────────────────

def test_client_secret_is_an_es256_jwt_apple_accepts(apple_env):
    cfg = apple_auth._config()
    token = apple_auth.client_secret(cfg, now=1_800_000_000)
    header = jwt.get_unverified_header(token)
    assert header["alg"] == "ES256"
    assert header["kid"] == "KEY1234567"
    claims = jwt.decode(token, apple_env, algorithms=["ES256"], audience="https://appleid.apple.com",
                        options={"verify_exp": False})
    assert claims["iss"] == "TEAM123456"
    assert claims["sub"] == "au.impulseapp.impulse"
    assert claims["iat"] == 1_800_000_000
    assert 0 < claims["exp"] - claims["iat"] <= 180 * 24 * 3600


# ── POST /users/me/apple-token ────────────────────────────────────────────────

class FakeQuery:
    def __init__(self, rows):
        self._rows = rows

    def filter(self, *a, **k):
        return self

    def first(self):
        return self._rows[0] if self._rows else None

    def all(self):
        return list(self._rows)

    def update(self, *a, **k):
        return 0

    def delete(self, *a, **k):
        return 0


class FakeSession:
    def __init__(self, user=None):
        self.user = user
        self.added = []
        self.commits = 0

    def query(self, model):
        if model is User:
            rows = [self.user] if self.user else [o for o in self.added if isinstance(o, User)]
            return FakeQuery(rows)
        return FakeQuery([])

    def add(self, obj):
        self.added.append(obj)

    def commit(self):
        self.commits += 1

    def rollback(self):
        pass


def _client(session):
    app = FastAPI()
    app.include_router(users.router, prefix="/users")
    app.dependency_overrides[get_db] = lambda: session
    app.dependency_overrides[get_current_user] = lambda: {"sub": UID, "email": "a@example.test"}
    return TestClient(app)


def test_exchanges_code_and_stores_refresh_token(apple_env, monkeypatch):
    calls = _stub_post(monkeypatch, _Resp(200, {"refresh_token": "r.abc", "access_token": "a"}))
    row = User(id=UID)
    session = FakeSession(row)
    resp = _client(session).post("/users/me/apple-token", json={"authorization_code": "c.123"})
    assert resp.status_code == 204
    url, data = calls[0]
    assert url == "https://appleid.apple.com/auth/token"
    assert data["grant_type"] == "authorization_code"
    assert data["code"] == "c.123"
    assert data["client_id"] == "au.impulseapp.impulse"
    assert data["client_secret"].count(".") == 2
    assert row.apple_refresh_token == "r.abc"
    assert session.commits == 1


def test_creates_user_row_if_signup_trigger_has_not_yet(apple_env, monkeypatch):
    _stub_post(monkeypatch, _Resp(200, {"refresh_token": "r.abc"}))
    session = FakeSession()
    assert _client(session).post("/users/me/apple-token", json={"authorization_code": "c"}).status_code == 204
    assert session.added[0].id == UID
    assert session.added[0].apple_refresh_token == "r.abc"


def test_missing_config_is_a_noop_success(no_apple_env, monkeypatch):
    calls = _stub_post(monkeypatch, _Resp(200, {"refresh_token": "r"}))
    session = FakeSession(User(id=UID))
    assert _client(session).post("/users/me/apple-token", json={"authorization_code": "c"}).status_code == 204
    assert calls == []
    assert session.commits == 0


def test_apple_refusing_the_code_is_a_502(apple_env, monkeypatch):
    _stub_post(monkeypatch, _Resp(400, text='{"error":"invalid_grant"}'))
    row = User(id=UID)
    session = FakeSession(row)
    assert _client(session).post("/users/me/apple-token", json={"authorization_code": "c"}).status_code == 502
    assert row.apple_refresh_token is None
    assert session.commits == 0


def test_empty_code_is_rejected(apple_env, monkeypatch):
    calls = _stub_post(monkeypatch, _Resp(200))
    assert _client(FakeSession()).post("/users/me/apple-token", json={"authorization_code": ""}).status_code == 422
    assert calls == []


# ── Revocation on DELETE /users/me ────────────────────────────────────────────

@pytest.fixture
def deleted(monkeypatch):
    """Stub the Supabase identity removal; records which users it was called for."""
    removed = []
    monkeypatch.setattr(users, "_delete_auth_user", removed.append)
    return removed


def test_delete_revokes_stored_apple_token(apple_env, monkeypatch, deleted):
    calls = _stub_post(monkeypatch, _Resp(200))
    users.delete_me(db=FakeSession(User(id=UID, apple_refresh_token="r.abc")), user={"sub": UID})
    url, data = calls[0]
    assert url == "https://appleid.apple.com/auth/revoke"
    assert data["token"] == "r.abc"
    assert data["token_type_hint"] == "refresh_token"
    assert data["client_id"] == "au.impulseapp.impulse"
    assert data["client_secret"]
    assert deleted == [UID]


def test_revocation_failure_does_not_block_deletion(apple_env, monkeypatch, deleted):
    _stub_post(monkeypatch, _Resp(500, text="oops"))
    users.delete_me(db=FakeSession(User(id=UID, apple_refresh_token="r.abc")), user={"sub": UID})
    assert deleted == [UID]


def test_revocation_network_error_does_not_block_deletion(apple_env, monkeypatch, deleted):
    import httpx
    _stub_post(monkeypatch, httpx.ConnectError("down"))
    users.delete_me(db=FakeSession(User(id=UID, apple_refresh_token="r.abc")), user={"sub": UID})
    assert deleted == [UID]


def test_revocation_without_config_does_not_block_deletion(no_apple_env, monkeypatch, deleted):
    calls = _stub_post(monkeypatch, _Resp(200))
    users.delete_me(db=FakeSession(User(id=UID, apple_refresh_token="r.abc")), user={"sub": UID})
    assert calls == []
    assert deleted == [UID]


def test_no_apple_token_means_no_apple_call(apple_env, monkeypatch, deleted):
    calls = _stub_post(monkeypatch, _Resp(200))
    users.delete_me(db=FakeSession(User(id=UID)), user={"sub": UID})
    assert calls == []
    assert deleted == [UID]


def test_venue_owner_refusal_names_the_right_support_address():
    class OwnerSession(FakeSession):
        def query(self, model):
            if model is Venue.id:
                return FakeQuery([("venue",)])
            return super().query(model)

    from fastapi import HTTPException
    with pytest.raises(HTTPException) as exc:
        users.delete_me(db=OwnerSession(), user={"sub": UID})
    assert exc.value.status_code == 409
    assert "support@impulseapp.au" in exc.value.detail
