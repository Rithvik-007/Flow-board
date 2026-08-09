from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session, joinedload

from app.deps import get_current_user, get_db, get_project_member, require_role
from app.models.column import Column
from app.models.comment import Comment
from app.models.invite import Invite, InviteStatus
from app.models.mention import Mention
from app.models.project import Project
from app.models.project_member import ProjectMember, ProjectRole
from app.models.task import Task
from app.models.user import User
from app.schemas import (
    InviteResponse,
    MemberInviteRequest,
    MemberRoleUpdate,
    ProjectCreate,
    ProjectDetailResponse,
    ProjectMemberResponse,
    ProjectResponse,
    TaskResponse,
)

router = APIRouter(prefix="/projects", tags=["projects"])

# Every new project starts with this fixed set of columns — after creation,
# columns are entirely user-managed (add/rename/delete/reorder).
STARTER_COLUMN_NAMES = ["To Do", "In Progress", "Done"]


@router.post("", response_model=ProjectResponse, status_code=status.HTTP_201_CREATED)
def create_project(
    project_in: ProjectCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    project = Project(
        name=project_in.name,
        description=project_in.description,
        owner_id=current_user.id,
    )
    db.add(project)
    db.flush()  # assigns project.id before we create the membership/column rows

    membership = ProjectMember(
        project_id=project.id,
        user_id=current_user.id,
        role=ProjectRole.owner,
    )
    db.add(membership)

    for position, name in enumerate(STARTER_COLUMN_NAMES):
        db.add(Column(project_id=project.id, name=name, position=position))

    db.commit()
    db.refresh(project)
    return project


@router.get("", response_model=list[ProjectResponse])
def list_my_projects(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return (
        db.query(Project)
        .join(ProjectMember, ProjectMember.project_id == Project.id)
        .filter(ProjectMember.user_id == current_user.id)
        .order_by(Project.created_at.desc())
        .all()
    )


@router.get("/{project_id}", response_model=ProjectDetailResponse)
def get_project(
    project_id: int,
    db: Session = Depends(get_db),
    _member: ProjectMember = Depends(get_project_member),
):
    project = (
        db.query(Project)
        .options(
            joinedload(Project.members).joinedload(ProjectMember.user),
            joinedload(Project.columns),
        )
        .filter(Project.id == project_id)
        .first()
    )
    if project is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")
    return project


@router.delete("/{project_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_project(
    project_id: int,
    db: Session = Depends(get_db),
    member: ProjectMember = Depends(get_project_member),
):
    require_role(member, ProjectRole.owner)

    project = db.get(Project, project_id)
    if project is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")

    # Project.members/tasks and Task.subtasks/comments are all configured with
    # cascade="all, delete-orphan", so this single delete removes everything
    # scoped to the project — no manual cleanup of child rows needed.
    db.delete(project)
    db.commit()


@router.get("/{project_id}/tasks", response_model=list[TaskResponse])
def list_project_tasks(
    project_id: int,
    db: Session = Depends(get_db),
    member: ProjectMember = Depends(get_project_member),
):
    tasks = (
        db.query(Task)
        .filter(Task.project_id == project_id)
        .order_by(Task.created_at.desc())
        .all()
    )

    # has_unread_mentions isn't a mapped column (see TaskResponse) — it's computed
    # here, per request, for whichever user is asking, since "unread" is inherently
    # relative to a specific viewer rather than a fact about the task itself.
    task_ids = [t.id for t in tasks]
    unread_task_ids: set[int] = set()
    if task_ids:
        unread_task_ids = {
            row[0]
            for row in db.query(Comment.task_id)
            .join(Mention, Mention.comment_id == Comment.id)
            .filter(
                Comment.task_id.in_(task_ids),
                Mention.mentioned_user_id == member.user_id,
                Mention.is_read.is_(False),
            )
            .distinct()
            .all()
        }

    responses = []
    for task in tasks:
        response = TaskResponse.model_validate(task)
        response.has_unread_mentions = task.id in unread_task_ids
        responses.append(response)
    return responses


@router.get("/{project_id}/members", response_model=list[ProjectMemberResponse])
def list_members(
    project_id: int,
    db: Session = Depends(get_db),
    _member: ProjectMember = Depends(get_project_member),
):
    return (
        db.query(ProjectMember)
        .options(joinedload(ProjectMember.user))
        .filter(ProjectMember.project_id == project_id)
        .order_by(ProjectMember.joined_at.asc())
        .all()
    )


@router.post("/{project_id}/invite", response_model=InviteResponse, status_code=status.HTTP_201_CREATED)
def invite_member(
    project_id: int,
    invite_in: MemberInviteRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    member: ProjectMember = Depends(get_project_member),
):
    require_role(member, ProjectRole.owner)

    # The invited email doesn't need a Flowboard account yet — invites are matched
    # to an account by email at list/accept time (GET /invites/my), not here. So we
    # can only check for an existing-member conflict when an account already exists.
    existing_user = db.query(User).filter(User.email == invite_in.email).first()
    if existing_user is not None:
        existing_membership = (
            db.query(ProjectMember)
            .filter(ProjectMember.project_id == project_id, ProjectMember.user_id == existing_user.id)
            .first()
        )
        if existing_membership is not None:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="This user is already a member of the project",
            )

    existing_invite = (
        db.query(Invite)
        .filter(
            Invite.project_id == project_id,
            Invite.invited_email == invite_in.email,
            Invite.status == InviteStatus.pending,
        )
        .first()
    )
    if existing_invite is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="This email already has a pending invite to this project",
        )

    invite = Invite(
        project_id=project_id,
        invited_email=invite_in.email,
        invited_by=current_user.id,
        role=invite_in.role,
    )
    db.add(invite)
    db.commit()
    db.refresh(invite)
    return invite


@router.patch("/{project_id}/members/{user_id}", response_model=ProjectMemberResponse)
def update_member_role(
    project_id: int,
    user_id: int,
    role_in: MemberRoleUpdate,
    db: Session = Depends(get_db),
    member: ProjectMember = Depends(get_project_member),
):
    require_role(member, ProjectRole.owner)

    if user_id == member.user_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Owners cannot change their own role",
        )

    target = (
        db.query(ProjectMember)
        .filter(ProjectMember.project_id == project_id, ProjectMember.user_id == user_id)
        .first()
    )
    if target is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Member not found")

    target.role = role_in.role
    db.commit()
    db.refresh(target)
    return target


@router.delete("/{project_id}/members/me", status_code=status.HTTP_204_NO_CONTENT)
def leave_project(
    project_id: int,
    db: Session = Depends(get_db),
    member: ProjectMember = Depends(get_project_member),
):
    # Registered ahead of DELETE /{project_id}/members/{user_id} below: since that
    # route's {user_id} is a path segment (not yet type-checked at routing time),
    # a request to .../members/me would otherwise match it first and only fail
    # int-conversion afterward, never reaching this route.
    if member.role == ProjectRole.owner:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                "Project owners can't leave their own project — delete the project instead "
                "(ownership transfer isn't supported yet)"
            ),
        )

    db.delete(member)
    db.commit()


@router.delete("/{project_id}/members/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
def remove_member(
    project_id: int,
    user_id: int,
    db: Session = Depends(get_db),
    member: ProjectMember = Depends(get_project_member),
):
    require_role(member, ProjectRole.owner)

    if user_id == member.user_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Owners cannot remove themselves from the project",
        )

    target = (
        db.query(ProjectMember)
        .filter(ProjectMember.project_id == project_id, ProjectMember.user_id == user_id)
        .first()
    )
    if target is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Member not found")

    db.delete(target)
    db.commit()
