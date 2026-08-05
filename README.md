# FlowBoard

A real-time collaborative project management board — think lightweight Trello/Jira. Organize work into projects, drag tasks across columns, add subtasks and comments, and see changes appear live for every team member via WebSockets.

## Tech Stack

| Layer    | Technology                              |
| -------- | --------------------------------------- |
| Frontend | Angular 20, RxJS, Angular CDK           |
| Backend  | FastAPI, SQLAlchemy, Pydantic           |
| Database | PostgreSQL (Neon)                       |
| Realtime | WebSockets (native browser ↔ Starlette) |
| Auth     | JWT (python-jose + bcrypt)              |

## Project Structure

```
FlowBoard/
├── backend/
│   ├── app/
│   │   ├── main.py              # FastAPI entrypoint & lifespan
│   │   ├── config.py            # Pydantic Settings (.env loader)
│   │   ├── database.py          # SQLAlchemy engine & session
│   │   ├── deps.py              # Dependency injection (auth, DB)
│   │   ├── schemas.py           # Pydantic request/response schemas
│   │   ├── security.py          # JWT creation & verification
│   │   ├── websocket_manager.py # Connection manager for live updates
│   │   ├── models/              # SQLAlchemy models
│   │   │   ├── user.py
│   │   │   ├── project.py
│   │   │   ├── project_member.py
│   │   │   ├── task.py
│   │   │   ├── subtask.py
│   │   │   └── comment.py
│   │   └── routers/             # API route handlers
│   │       ├── auth.py
│   │       ├── projects.py
│   │       ├── tasks.py
│   │       ├── subtasks.py
│   │       ├── comments.py
│   │       └── ws.py
│   ├── .env.example
│   └── requirements.txt
│
└── frontend/
    └── src/app/
        ├── core/                # Guards, services, layout shell
        └── pages/               # Route-level components
            ├── landing/
            ├── login/
            ├── register/
            ├── projects/
            ├── project-board/
            └── project-settings/
```

## Getting Started

### Prerequisites

- Python 3.11+
- Node.js 18+
- A PostgreSQL database (or a [Neon](https://neon.tech) free-tier project)

### Backend

```bash
cd backend

# Create & activate a virtual environment
python -m venv venv
venv\Scripts\activate        # Windows
# source venv/bin/activate   # macOS / Linux

# Install dependencies
pip install -r requirements.txt

# Configure environment
cp .env.example .env
# Edit .env with your DATABASE_URL and SECRET_KEY

# Run the dev server
uvicorn app.main:app --port 8000 --reload
```

The API will be available at **http://localhost:8000**. Interactive docs at `/docs`.

### Frontend

```bash
cd frontend

# Install dependencies
npm install

# Run the dev server
ng serve
```

The app will be available at **http://localhost:4200**.

## Key Features

- **Projects** — Create, rename, and manage projects; invite members with Owner / Admin / Member roles.
- **Kanban Board** — Drag-and-drop tasks across status columns with optimistic UI updates.
- **Tasks** — Create, edit, reorder, and assign tasks with priority levels and descriptions.
- **Subtasks** — Break tasks into checkable subtasks.
- **Comments** — Threaded comments on tasks.
- **Real-time Sync** — WebSocket-powered live updates so every team member sees changes instantly.
- **Auth** — JWT-based registration and login with bcrypt password hashing.
