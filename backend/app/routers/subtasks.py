from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.deps import get_current_user, get_db, get_task_or_404, require_role, verify_project_membership
from app.models.project_member import ProjectRole
from app.models.subtask import Subtask
from app.models.user import User
from app.schemas import SubtaskCreate, SubtaskResponse, SubtaskUpdate
from app.websocket_manager import manager

# No single prefix here: this router serves both /tasks/{task_id}/subtasks
# (nested under the parent task) and /subtasks/{subtask_id} (once you have
# a subtask's own id, you no longer need the parent task_id in the URL).
router = APIRouter(tags=["subtasks"])


def _get_subtask_or_404(db: Session, subtask_id: int) -> Subtask:
    subtask = db.get(Subtask, subtask_id)
    if subtask is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Subtask not found")
    return subtask


@router.post(
    "/tasks/{task_id}/subtasks",
    response_model=SubtaskResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_subtask(
    task_id: int,
    subtask_in: SubtaskCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    task = get_task_or_404(db, task_id)
    member = verify_project_membership(db, task.project_id, current_user.id)
    require_role(member, ProjectRole.owner, ProjectRole.member)

    subtask = Subtask(task_id=task_id, title=subtask_in.title)
    db.add(subtask)
    db.commit()
    db.refresh(subtask)

    await manager.broadcast(
        task.project_id,
        {"event": "subtask_created", "task_id": task_id},
        exclude_user_id=current_user.id,
    )
    return subtask


@router.get("/tasks/{task_id}/subtasks", response_model=list[SubtaskResponse])
def list_subtasks(
    task_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    task = get_task_or_404(db, task_id)
    verify_project_membership(db, task.project_id, current_user.id)

    return (
        db.query(Subtask)
        .filter(Subtask.task_id == task_id)
        .order_by(Subtask.created_at.asc())
        .all()
    )


@router.patch("/subtasks/{subtask_id}", response_model=SubtaskResponse)
async def update_subtask(
    subtask_id: int,
    subtask_in: SubtaskUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    subtask = _get_subtask_or_404(db, subtask_id)
    task = get_task_or_404(db, subtask.task_id)
    member = verify_project_membership(db, task.project_id, current_user.id)
    require_role(member, ProjectRole.owner, ProjectRole.member)

    for field, value in subtask_in.model_dump(exclude_unset=True).items():
        setattr(subtask, field, value)

    db.commit()
    db.refresh(subtask)

    await manager.broadcast(
        task.project_id,
        {"event": "subtask_updated", "task_id": task.id},
        exclude_user_id=current_user.id,
    )
    return subtask


@router.delete("/subtasks/{subtask_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_subtask(
    subtask_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    subtask = _get_subtask_or_404(db, subtask_id)
    task = get_task_or_404(db, subtask.task_id)
    member = verify_project_membership(db, task.project_id, current_user.id)
    require_role(member, ProjectRole.owner, ProjectRole.member)

    task_id = task.id
    db.delete(subtask)
    db.commit()

    await manager.broadcast(
        task.project_id,
        {"event": "subtask_deleted", "task_id": task_id},
        exclude_user_id=current_user.id,
    )
