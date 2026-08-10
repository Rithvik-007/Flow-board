import os
from pathlib import Path

# This must run before anything imports `app.*`. app.config.settings is built once,
# at first import, from a @lru_cache-wrapped Settings() call — whichever
# DATABASE_URL is in the environment at that moment is the one the whole test
# session is stuck with. Setting it here, at conftest.py's module level (which
# pytest always imports before collecting any test file), guarantees that happens
# before app.database creates its engine, so tests run against a throwaway
# file-based SQLite database and never touch the real Postgres dev database that
# backend/.env points at.
TEST_DB_PATH = Path(__file__).parent / "test.db"
if TEST_DB_PATH.exists():
    TEST_DB_PATH.unlink()

os.environ["DATABASE_URL"] = f"sqlite:///{TEST_DB_PATH}"
os.environ.setdefault("SECRET_KEY", "test-secret-key-not-for-production")

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from app.database import Base, SessionLocal, engine  # noqa: E402
from app.main import app  # noqa: E402

# `import app.models` here would silently rebind the name `app` in this module to
# the `app` package itself, shadowing the FastAPI instance imported above — hence
# `from app import models` instead, which only binds `models`.
from app import models  # noqa: E402,F401  registers every model class on Base.metadata


@pytest.fixture(scope="session", autouse=True)
def _schema():
    """Creates every table once for the whole test session, and drops the SQLite
    file afterward so a stale test.db never lingers between runs."""
    Base.metadata.create_all(bind=engine)
    yield
    engine.dispose()
    if TEST_DB_PATH.exists():
        TEST_DB_PATH.unlink()


@pytest.fixture(autouse=True)
def _clean_database():
    """Every test starts from an empty database. Cleaning up *after* each test
    (rather than before) means a failed test's leftover rows can't leak into
    whichever test happens to run next."""
    yield
    with engine.begin() as conn:
        for table in reversed(Base.metadata.sorted_tables):
            conn.execute(table.delete())


@pytest.fixture()
def client():
    """A fresh TestClient per test. Entering it as a context manager runs the
    app's lifespan handler, same as a real server starting up."""
    with TestClient(app) as c:
        yield c


@pytest.fixture()
def db():
    """A raw DB session for tests that exercise plain functions (like the
    permission helpers in app.deps) directly, without going through the API."""
    session = SessionLocal()
    yield session
    session.close()
