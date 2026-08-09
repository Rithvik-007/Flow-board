from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.deps import get_current_user, get_db, get_project_member, require_role, verify_project_membership
from app.models.column import Column
from app.models.project_member import ProjectMember, ProjectRole
from app.models.task import Task
from app.models.user import User
from app.schemas import ColumnCreate, ColumnReorderRequest, ColumnResponse, ColumnUpdate
from app.websocket_manager import manager

# No single prefix: this router serves /projects/{project_id}/columns (nested,
# creation + reorder — both need the project_id) and /columns/{column_id} (once
# you have a column's own id, same pattern as subtasks.py).
router = APIRouter(tags=["columns"])


def _get_column_or_404(db: Session, column_id: int) -> Column:
    column = db.get(Column, column_id)
    if column is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Column not found")
    return column


@router.post(
    "/projects/{project_id}/columns",
    response_model=ColumnResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_column(
    project_id: int,
    column_in: ColumnCreate,
    db: Session = Depends(get_db),
    member: ProjectMember = Depends(get_project_member),
):
    require_role(member, ProjectRole.owner, ProjectRole.member)

    last_position = (
        db.query(Column.position)
        .filter(Column.project_id == project_id)
        .order_by(Column.position.desc())
        .first()
    )
    next_position = (last_position[0] + 1) if last_position else 0

    column = Column(project_id=project_id, name=column_in.name, position=next_position)
    db.add(column)
    db.commit()
    db.refresh(column)
    return column


@router.patch("/columns/{column_id}", response_model=ColumnResponse)
def update_column(
    column_id: int,
    column_in: ColumnUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    column = _get_column_or_404(db, column_id)
    member = verify_project_membership(db, column.project_id, current_user.id)
    require_role(member, ProjectRole.owner, ProjectRole.member)

    column.name = column_in.name
    db.commit()
    db.refresh(column)
    return column


@router.delete("/columns/{column_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_column(
    column_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    column = _get_column_or_404(db, column_id)
    member = verify_project_membership(db, column.project_id, current_user.id)
    # Deletion is intentionally owner-only (unlike create/rename) — consistent with
    # how task/subtask deletion was restricted, since it's a destructive action.
    require_role(member, ProjectRole.owner)

    task_count = db.query(Task).filter(Task.column_id == column_id).count()
    if task_count > 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="This column still has tasks in it. Move or delete those tasks before deleting the column.",
        )

    db.delete(column)
    db.commit()


@router.patch("/projects/{project_id}/columns/reorder", response_model=list[ColumnResponse])
async def reorder_columns(
    project_id: int,
    reorder_in: ColumnReorderRequest,
    db: Session = Depends(get_db),
    member: ProjectMember = Depends(get_project_member),
):
    require_role(member, ProjectRole.owner, ProjectRole.member)

    columns = db.query(Column).filter(Column.project_id == project_id).all()
    columns_by_id = {c.id: c for c in columns}

    if set(reorder_in.column_ids) != set(columns_by_id.keys()):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="column_ids must include exactly the project's current columns, each listed once",
        )

    for position, column_id in enumerate(reorder_in.column_ids):
        columns_by_id[column_id].position = position

    db.commit()

    await manager.broadcast(
        project_id,
        {"event": "columns_reordered", "project_id": project_id},
        exclude_user_id=member.user_id,
    )
    return sorted(columns_by_id.values(), key=lambda c: c.position)
