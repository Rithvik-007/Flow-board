from datetime import datetime

from pydantic import BaseModel, ConfigDict, EmailStr, field_validator

from app.models.invite import InviteStatus
from app.models.project_member import ProjectRole
from app.models.task import TaskPriority


# ---- Auth / Users ----

class UserCreate(BaseModel):
    email: EmailStr
    password: str
    name: str


class UserResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    email: EmailStr
    name: str
    created_at: datetime


class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"


# ---- Projects ----

class ProjectCreate(BaseModel):
    name: str
    description: str | None = None


class ProjectMemberResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    user_id: int
    role: ProjectRole
    joined_at: datetime
    user: UserResponse


class ProjectResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    description: str | None
    owner_id: int
    created_at: datetime


# ---- Columns ----

class ColumnCreate(BaseModel):
    name: str


class ColumnUpdate(BaseModel):
    name: str


class ColumnResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    project_id: int
    name: str
    position: int
    created_at: datetime


class ColumnReorderRequest(BaseModel):
    column_ids: list[int]


class ProjectDetailResponse(ProjectResponse):
    members: list[ProjectMemberResponse]
    columns: list[ColumnResponse]


class MemberInviteRequest(BaseModel):
    email: EmailStr
    role: ProjectRole = ProjectRole.member

    @field_validator("role")
    @classmethod
    def role_must_not_be_owner(cls, v: ProjectRole) -> ProjectRole:
        if v == ProjectRole.owner:
            raise ValueError("Cannot invite a member as owner")
        return v


class MemberRoleUpdate(BaseModel):
    role: ProjectRole

    @field_validator("role")
    @classmethod
    def role_must_not_be_owner(cls, v: ProjectRole) -> ProjectRole:
        if v == ProjectRole.owner:
            raise ValueError("Cannot change a member's role to owner")
        return v


# ---- Invites ----

class InviteResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    project_id: int
    invited_email: EmailStr
    invited_by: int
    role: ProjectRole
    status: InviteStatus
    created_at: datetime


class InviteProjectSummary(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str


class MyInviteResponse(InviteResponse):
    project: InviteProjectSummary
    inviter: UserResponse


# ---- Tasks ----

class TaskCreate(BaseModel):
    project_id: int
    title: str
    description: str | None = None
    assignee_id: int | None = None
    due_date: datetime | None = None
    column_id: int
    priority: TaskPriority = TaskPriority.medium


class TaskUpdate(BaseModel):
    title: str | None = None
    description: str | None = None
    column_id: int | None = None
    assignee_id: int | None = None
    due_date: datetime | None = None
    priority: TaskPriority | None = None


class TaskResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    project_id: int
    title: str
    description: str | None
    column_id: int
    priority: TaskPriority
    assignee_id: int | None
    created_by: int
    due_date: datetime | None
    created_at: datetime
    # Not a mapped column — computed per-request for the current user (see
    # list_project_tasks) and defaulted here so other endpoints that return a
    # bare Task (create/update) don't need to know about mentions at all.
    has_unread_mentions: bool = False


# ---- Subtasks ----

class SubtaskCreate(BaseModel):
    title: str


class SubtaskUpdate(BaseModel):
    title: str | None = None
    is_complete: bool | None = None


class SubtaskResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    task_id: int
    title: str
    is_complete: bool
    created_at: datetime


# ---- Comments ----

class CommentCreate(BaseModel):
    content: str


class CommentResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    task_id: int
    user_id: int
    content: str
    created_at: datetime
    user: UserResponse
