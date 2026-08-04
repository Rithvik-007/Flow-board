from fastapi import APIRouter, Query, WebSocket, WebSocketDisconnect
from jose import JWTError
from sqlalchemy.orm import Session

from app.database import SessionLocal
from app.models.project_member import ProjectMember
from app.models.user import User
from app.security import decode_access_token
from app.websocket_manager import manager

router = APIRouter(tags=["websocket"])


def _authenticate(db: Session, token: str | None) -> User | None:
    """Browsers can't set custom headers on a WebSocket handshake, so the JWT that
    normally rides in the Authorization header travels as a query param instead —
    the frontend connects to /ws/{project_id}?token=<access_token>."""
    if token is None:
        return None
    try:
        payload = decode_access_token(token)
    except JWTError:
        return None
    user_id = payload.get("sub")
    if user_id is None:
        return None
    return db.get(User, int(user_id))


@router.websocket("/ws/{project_id}")
async def project_updates(
    websocket: WebSocket,
    project_id: int,
    token: str | None = Query(default=None),
) -> None:
    await websocket.accept()

    db = SessionLocal()
    try:
        user = _authenticate(db, token)
        if user is None:
            await websocket.close(code=4401, reason="Invalid or missing token")
            return

        member = (
            db.query(ProjectMember)
            .filter(ProjectMember.project_id == project_id, ProjectMember.user_id == user.id)
            .first()
        )
        if member is None:
            await websocket.close(code=4403, reason="Not a member of this project")
            return
    finally:
        db.close()

    manager.connect(project_id, websocket, user.id)
    try:
        while True:
            # The frontend never sends anything meaningful over this socket — this just
            # blocks until the browser disconnects (tab close, navigation, network drop),
            # which raises WebSocketDisconnect.
            await websocket.receive_text()
    except WebSocketDisconnect:
        pass
    finally:
        manager.disconnect(project_id, websocket)
