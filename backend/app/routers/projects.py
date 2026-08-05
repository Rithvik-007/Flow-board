from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session, joinedload

from app.deps import get_current_user, get_db, get_project_member, require_role
from app.models.project import Project
from app.models.project_member import ProjectMember, ProjectRole
from app.models.task import Task
from app.models.user import User
from app.schemas import (
    MemberInviteRequest,
    MemberRoleUpdate,
    ProjectCreate,
    ProjectDetailResponse,
    ProjectMemberResponse,
    ProjectResponse,
    TaskResponse,
)

router = APIRouter(prefix="/projects", tags=["projects"])


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
    db.flush()  # assigns project.id before we create the membership row

    membership = ProjectMember(
        project_id=project.id,
        user_id=current_user.id,
        role=ProjectRole.owner,
    )
    db.add(membership)
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
        .options(joinedload(Project.members).joinedload(ProjectMember.user))
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
    _member: ProjectMember = Depends(get_project_member),
):
    return (
        db.query(Task)
        .filter(Task.project_id == project_id)
        .order_by(Task.created_at.desc())
        .all()
    )


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


@router.post("/{project_id}/invite", response_model=ProjectMemberResponse, status_code=status.HTTP_201_CREATED)
def invite_member(
    project_id: int,
    invite_in: MemberInviteRequest,
    db: Session = Depends(get_db),
    member: ProjectMember = Depends(get_project_member),
):
    require_role(member, ProjectRole.owner)

    user = db.query(User).filter(User.email == invite_in.email).first()
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No Flowboard account found for that email",
        )

    existing = (
        db.query(ProjectMember)
        .filter(ProjectMember.project_id == project_id, ProjectMember.user_id == user.id)
        .first()
    )
    if existing is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="This user is already a member of the project",
        )

    new_member = ProjectMember(project_id=project_id, user_id=user.id, role=invite_in.role)
    db.add(new_member)
    db.commit()
    db.refresh(new_member)
    return new_member


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
