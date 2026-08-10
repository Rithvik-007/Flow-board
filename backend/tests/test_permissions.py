"""Unit tests for the two functions that gate every write action in the app —
see app/deps.py's own docstrings on verify_project_membership and require_role.
These call the functions directly against a raw DB session, without going
through the HTTP layer, since they're plain functions, not endpoints."""

import pytest
from fastapi import HTTPException

from app.deps import require_role, verify_project_membership
from app.models.project import Project
from app.models.project_member import ProjectMember, ProjectRole
from app.models.user import User
from app.security import hash_password


def _make_user(db, email: str) -> User:
    user = User(email=email, name=email.split("@")[0], hashed_password=hash_password("password123"))
    db.add(user)
    db.flush()
    return user


def _make_project(db, owner: User) -> Project:
    project = Project(name="Test Project", owner_id=owner.id)
    db.add(project)
    db.flush()
    return project


def test_verify_project_membership_passes_for_an_actual_member(db):
    owner = _make_user(db, "owner1@example.com")
    project = _make_project(db, owner)
    db.add(ProjectMember(project_id=project.id, user_id=owner.id, role=ProjectRole.owner))
    db.commit()

    member = verify_project_membership(db, project.id, owner.id)

    assert member.user_id == owner.id
    assert member.role == ProjectRole.owner


def test_verify_project_membership_rejects_a_non_member(db):
    owner = _make_user(db, "owner2@example.com")
    outsider = _make_user(db, "outsider@example.com")
    project = _make_project(db, owner)
    db.add(ProjectMember(project_id=project.id, user_id=owner.id, role=ProjectRole.owner))
    db.commit()

    with pytest.raises(HTTPException) as exc_info:
        verify_project_membership(db, project.id, outsider.id)

    assert exc_info.value.status_code == 403


def test_require_role_blocks_a_viewer_from_a_member_only_action(db):
    owner = _make_user(db, "owner3@example.com")
    project = _make_project(db, owner)
    viewer_user = _make_user(db, "viewer@example.com")
    viewer_member = ProjectMember(project_id=project.id, user_id=viewer_user.id, role=ProjectRole.viewer)
    db.add(viewer_member)
    db.commit()

    with pytest.raises(HTTPException) as exc_info:
        require_role(viewer_member, ProjectRole.owner, ProjectRole.member)

    assert exc_info.value.status_code == 403


def test_require_role_allows_a_member_for_a_member_only_action(db):
    owner = _make_user(db, "owner4@example.com")
    project = _make_project(db, owner)
    member_user = _make_user(db, "member@example.com")
    member = ProjectMember(project_id=project.id, user_id=member_user.id, role=ProjectRole.member)
    db.add(member)
    db.commit()

    require_role(member, ProjectRole.owner, ProjectRole.member)  # should not raise


def test_require_role_allows_the_owner_for_an_owner_only_action(db):
    owner = _make_user(db, "owner5@example.com")
    project = _make_project(db, owner)
    owner_member = ProjectMember(project_id=project.id, user_id=owner.id, role=ProjectRole.owner)
    db.add(owner_member)
    db.commit()

    require_role(owner_member, ProjectRole.owner)  # should not raise


def test_require_role_blocks_a_member_from_an_owner_only_action(db):
    owner = _make_user(db, "owner6@example.com")
    project = _make_project(db, owner)
    member_user = _make_user(db, "member2@example.com")
    member = ProjectMember(project_id=project.id, user_id=member_user.id, role=ProjectRole.member)
    db.add(member)
    db.commit()

    with pytest.raises(HTTPException) as exc_info:
        require_role(member, ProjectRole.owner)

    assert exc_info.value.status_code == 403
