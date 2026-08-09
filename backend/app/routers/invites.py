from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session, joinedload

from app.deps import get_current_user, get_db
from app.models.invite import Invite, InviteStatus
from app.models.project_member import ProjectMember
from app.models.user import User
from app.schemas import InviteResponse, MyInviteResponse

router = APIRouter(prefix="/invites", tags=["invites"])


def _get_invite_or_404(db: Session, invite_id: int) -> Invite:
    invite = db.get(Invite, invite_id)
    if invite is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Invite not found")
    return invite


def _require_invite_recipient(invite: Invite, current_user: User) -> None:
    # Same exact-match convention the rest of the app uses for email (see
    # auth.py's register/login lookups) rather than a case-insensitive compare.
    if invite.invited_email != current_user.email:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="This invite was not sent to you",
        )


@router.get("/my", response_model=list[MyInviteResponse])
def list_my_invites(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return (
        db.query(Invite)
        .options(joinedload(Invite.project), joinedload(Invite.inviter))
        .filter(Invite.invited_email == current_user.email, Invite.status == InviteStatus.pending)
        .order_by(Invite.created_at.desc())
        .all()
    )


@router.patch("/{invite_id}/accept", response_model=InviteResponse)
def accept_invite(
    invite_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    invite = _get_invite_or_404(db, invite_id)
    _require_invite_recipient(invite, current_user)

    if invite.status != InviteStatus.pending:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="This invite has already been responded to",
        )

    existing_membership = (
        db.query(ProjectMember)
        .filter(ProjectMember.project_id == invite.project_id, ProjectMember.user_id == current_user.id)
        .first()
    )
    if existing_membership is None:
        db.add(ProjectMember(project_id=invite.project_id, user_id=current_user.id, role=invite.role))

    invite.status = InviteStatus.accepted
    db.commit()
    db.refresh(invite)
    return invite


@router.patch("/{invite_id}/decline", response_model=InviteResponse)
def decline_invite(
    invite_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    invite = _get_invite_or_404(db, invite_id)
    _require_invite_recipient(invite, current_user)

    if invite.status != InviteStatus.pending:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="This invite has already been responded to",
        )

    invite.status = InviteStatus.declined
    db.commit()
    db.refresh(invite)
    return invite
