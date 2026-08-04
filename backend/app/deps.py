from collections.abc import Generator

from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError
from sqlalchemy.orm import Session

from app.database import SessionLocal
from app.models.project_member import ProjectMember, ProjectRole
from app.models.task import Task
from app.models.user import User
from app.security import decode_access_token

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/login")


def get_db() -> Generator[Session, None, None]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def get_current_user(
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db),
) -> User:
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = decode_access_token(token)
        user_id = payload.get("sub")
        if user_id is None:
            raise credentials_exception
    except JWTError:
        raise credentials_exception

    user = db.get(User, int(user_id))
    if user is None:
        raise credentials_exception
    return user


def verify_project_membership(db: Session, project_id: int, user_id: int) -> ProjectMember:
    """Plain helper (not a FastAPI dependency) so it can be called with a project_id
    that comes from a request body instead of the URL path, e.g. when creating a task."""
    member = (
        db.query(ProjectMember)
        .filter(ProjectMember.project_id == project_id, ProjectMember.user_id == user_id)
        .first()
    )
    if member is None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You do not have access to this project",
        )
    return member


def get_project_member(
    project_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> ProjectMember:
    """Path-based dependency: verifies the current user belongs to the :project_id in the URL."""
    return verify_project_membership(db, project_id, current_user.id)


def require_role(member: ProjectMember, *allowed: ProjectRole) -> None:
    """Call after verify_project_membership/get_project_member to additionally gate on role.
    Membership alone is not enough for write actions — this is the actual enforcement point,
    independent of anything the frontend hides."""
    if member.role not in allowed:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You do not have permission to perform this action",
        )


def get_task_or_404(db: Session, task_id: int) -> Task:
    """Shared by tasks/subtasks/comments routers: subtasks and comments don't carry
    a project_id of their own, so this is how they find the project to check membership against."""
    task = db.get(Task, task_id)
    if task is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Task not found")
    return task
