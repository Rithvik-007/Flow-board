from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from app.deps import get_current_user, get_db, get_task_or_404, require_role, verify_project_membership
from app.models.project_member import ProjectRole
from app.models.task import Task
from app.models.user import User
from app.schemas import TaskCreate, TaskResponse, TaskUpdate
from app.websocket_manager import manager

router = APIRouter(prefix="/tasks", tags=["tasks"])


@router.post("", response_model=TaskResponse, status_code=status.HTTP_201_CREATED)
async def create_task(
    task_in: TaskCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    member = verify_project_membership(db, task_in.project_id, current_user.id)
    require_role(member, ProjectRole.owner, ProjectRole.member)

    task = Task(
        project_id=task_in.project_id,
        title=task_in.title,
        description=task_in.description,
        assignee_id=task_in.assignee_id,
        due_date=task_in.due_date,
        status=task_in.status,
        priority=task_in.priority,
        created_by=current_user.id,
    )
    db.add(task)
    db.commit()
    db.refresh(task)

    await manager.broadcast(
        task.project_id,
        {"event": "task_created", "task_id": task.id},
        exclude_user_id=current_user.id,
    )
    return task


@router.patch("/{task_id}", response_model=TaskResponse)
async def update_task(
    task_id: int,
    task_in: TaskUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    task = get_task_or_404(db, task_id)
    member = verify_project_membership(db, task.project_id, current_user.id)
    require_role(member, ProjectRole.owner, ProjectRole.member)

    for field, value in task_in.model_dump(exclude_unset=True).items():
        setattr(task, field, value)

    db.commit()
    db.refresh(task)

    await manager.broadcast(
        task.project_id,
        {"event": "task_updated", "task_id": task.id},
        exclude_user_id=current_user.id,
    )
    return task


@router.delete("/{task_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_task(
    task_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    task = get_task_or_404(db, task_id)
    member = verify_project_membership(db, task.project_id, current_user.id)
    require_role(member, ProjectRole.owner, ProjectRole.member)

    project_id = task.project_id
    deleted_task_id = task.id
    db.delete(task)
    db.commit()

    await manager.broadcast(
        project_id,
        {"event": "task_deleted", "task_id": deleted_task_id},
        exclude_user_id=current_user.id,
    )
