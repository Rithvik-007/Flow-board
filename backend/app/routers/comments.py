from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.deps import get_current_user, get_db, get_task_or_404, require_role, verify_project_membership
from app.models.comment import Comment
from app.models.project_member import ProjectRole
from app.models.user import User
from app.schemas import CommentCreate, CommentResponse
from app.websocket_manager import manager

router = APIRouter(tags=["comments"])


def _get_comment_or_404(db: Session, comment_id: int) -> Comment:
    comment = db.get(Comment, comment_id)
    if comment is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Comment not found")
    return comment


@router.post(
    "/tasks/{task_id}/comments",
    response_model=CommentResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_comment(
    task_id: int,
    comment_in: CommentCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    task = get_task_or_404(db, task_id)
    member = verify_project_membership(db, task.project_id, current_user.id)
    require_role(member, ProjectRole.owner, ProjectRole.member)

    comment = Comment(task_id=task_id, user_id=current_user.id, content=comment_in.content)
    db.add(comment)
    db.commit()
    db.refresh(comment)

    await manager.broadcast(
        task.project_id,
        {"event": "comment_added", "task_id": task_id},
        exclude_user_id=current_user.id,
    )
    return comment


@router.get("/tasks/{task_id}/comments", response_model=list[CommentResponse])
def list_comments(
    task_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    task = get_task_or_404(db, task_id)
    verify_project_membership(db, task.project_id, current_user.id)

    return (
        db.query(Comment)
        .filter(Comment.task_id == task_id)
        .order_by(Comment.created_at.asc())
        .all()
    )


@router.delete("/comments/{comment_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_comment(
    comment_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    comment = _get_comment_or_404(db, comment_id)
    task = get_task_or_404(db, comment.task_id)
    member = verify_project_membership(db, task.project_id, current_user.id)
    require_role(member, ProjectRole.owner, ProjectRole.member)

    if comment.user_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You can only delete your own comments",
        )

    task_id = task.id
    db.delete(comment)
    db.commit()

    await manager.broadcast(
        task.project_id,
        {"event": "comment_deleted", "task_id": task_id},
        exclude_user_id=current_user.id,
    )
