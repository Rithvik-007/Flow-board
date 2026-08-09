import re

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session, joinedload

from app.deps import get_current_user, get_db, get_task_or_404, require_role, verify_project_membership
from app.models.comment import Comment
from app.models.mention import Mention
from app.models.project_member import ProjectMember, ProjectRole
from app.models.user import User
from app.schemas import CommentCreate, CommentResponse
from app.websocket_manager import manager

router = APIRouter(tags=["comments"])


def _get_comment_or_404(db: Session, comment_id: int) -> Comment:
    comment = db.get(Comment, comment_id)
    if comment is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Comment not found")
    return comment


def _extract_mentioned_user_ids(content: str, members: list[ProjectMember]) -> set[int]:
    """Finds @Name mentions in comment text and matches them against this project's
    members. Longest names are tried first and matched spans are tracked so that a
    shorter member's name (e.g. "Sam") can't steal part of a match that really
    belongs to a longer one (e.g. "Sam Smith") appearing in the same text."""
    mentioned_user_ids: set[int] = set()
    claimed_spans: list[tuple[int, int]] = []

    for member in sorted(members, key=lambda m: len(m.user.name), reverse=True):
        pattern = re.compile(r"(?<!\w)@" + re.escape(member.user.name) + r"(?!\w)")
        for match in pattern.finditer(content):
            start, end = match.span()
            if any(start < claimed_end and end > claimed_start for claimed_start, claimed_end in claimed_spans):
                continue
            claimed_spans.append((start, end))
            mentioned_user_ids.add(member.user_id)
            break

    return mentioned_user_ids


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
    db.flush()  # assigns comment.id before mention rows can reference it

    project_members = (
        db.query(ProjectMember)
        .options(joinedload(ProjectMember.user))
        .filter(ProjectMember.project_id == task.project_id)
        .all()
    )
    # Skip a self-mention rather than creating a Mention row for it — notifying
    # someone that they mentioned themselves has no purpose and would just show
    # up as a permanently-achievable "unread" badge on their own comment.
    mentioned_user_ids = _extract_mentioned_user_ids(comment_in.content, project_members) - {current_user.id}
    for user_id in mentioned_user_ids:
        db.add(Mention(comment_id=comment.id, mentioned_user_id=user_id))

    db.commit()
    db.refresh(comment)

    await manager.broadcast(
        task.project_id,
        {"event": "comment_added", "task_id": task_id},
        exclude_user_id=current_user.id,
    )

    for user_id in mentioned_user_ids:
        await manager.broadcast_to_user(
            user_id,
            {"event": "mention_added", "task_id": task_id, "project_id": task.project_id},
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

    comments = (
        db.query(Comment)
        .filter(Comment.task_id == task_id)
        .order_by(Comment.created_at.asc())
        .all()
    )

    # Viewing a task's comments doubles as "reading" any of the current user's
    # mentions on this task — no dedicated mark-as-read endpoint needed for that.
    comment_ids = [c.id for c in comments]
    if comment_ids:
        db.query(Mention).filter(
            Mention.comment_id.in_(comment_ids),
            Mention.mentioned_user_id == current_user.id,
            Mention.is_read.is_(False),
        ).update({"is_read": True}, synchronize_session=False)
        db.commit()

    return comments


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
