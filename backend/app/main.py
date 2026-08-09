from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.database import Base, engine
from app.routers import auth, columns, comments, invites, projects, subtasks, tasks, ws

# Importing app.models registers every model class on Base's metadata, so
# create_all() below knows to create all tables, not just some of them.
import app.models  # noqa: F401


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Phase 1: create tables directly from the models. A later phase can swap
    # this for Alembic migrations without touching any other file.
    Base.metadata.create_all(bind=engine)
    yield


app = FastAPI(title="Flowboard API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(projects.router)
app.include_router(invites.router)
app.include_router(tasks.router)
app.include_router(columns.router)
app.include_router(subtasks.router)
app.include_router(comments.router)
app.include_router(ws.router)


@app.get("/")
def read_root():
    return {"message": "Flowboard API"}
