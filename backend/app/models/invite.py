import enum
from datetime import datetime

from sqlalchemy import DateTime, Enum, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.sql import func

from app.database import Base
from app.models.project_member import ProjectRole


class InviteStatus(str, enum.Enum):
    pending = "pending"
    accepted = "accepted"
    declined = "declined"


class Invite(Base):
    __tablename__ = "invites"

    id: Mapped[int] = mapped_column(primary_key=True)
    project_id: Mapped[int] = mapped_column(ForeignKey("projects.id"), nullable=False)
    # Stored as a plain email, not a user_id: the invited person may not have a
    # Flowboard account yet. Matching to an account happens later, by email, at
    # login/list-time (see GET /invites/my) rather than at invite-creation time.
    invited_email: Mapped[str] = mapped_column(String, nullable=False, index=True)
    invited_by: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    role: Mapped[ProjectRole] = mapped_column(Enum(ProjectRole), nullable=False, default=ProjectRole.member)
    status: Mapped[InviteStatus] = mapped_column(Enum(InviteStatus), nullable=False, default=InviteStatus.pending)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    project = relationship("Project", back_populates="invites")
    inviter = relationship("User", foreign_keys=[invited_by])
