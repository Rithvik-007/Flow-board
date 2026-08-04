import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { API_BASE_URL } from '../api.config';
import {
  MemberInviteRequest,
  MemberRoleUpdateRequest,
  Project,
  ProjectCreateRequest,
  ProjectDetail,
  ProjectMember,
} from '../models/project.model';

@Injectable({ providedIn: 'root' })
export class ProjectService {
  constructor(private http: HttpClient) {}

  listProjects(): Observable<Project[]> {
    return this.http.get<Project[]>(`${API_BASE_URL}/projects`);
  }

  getProject(id: number): Observable<ProjectDetail> {
    return this.http.get<ProjectDetail>(`${API_BASE_URL}/projects/${id}`);
  }

  createProject(request: ProjectCreateRequest): Observable<Project> {
    return this.http.post<Project>(`${API_BASE_URL}/projects`, request);
  }

  listMembers(projectId: number): Observable<ProjectMember[]> {
    return this.http.get<ProjectMember[]>(`${API_BASE_URL}/projects/${projectId}/members`);
  }

  inviteMember(projectId: number, request: MemberInviteRequest): Observable<ProjectMember> {
    return this.http.post<ProjectMember>(`${API_BASE_URL}/projects/${projectId}/invite`, request);
  }

  updateMemberRole(
    projectId: number,
    userId: number,
    request: MemberRoleUpdateRequest,
  ): Observable<ProjectMember> {
    return this.http.patch<ProjectMember>(
      `${API_BASE_URL}/projects/${projectId}/members/${userId}`,
      request,
    );
  }

  removeMember(projectId: number, userId: number): Observable<void> {
    return this.http.delete<void>(`${API_BASE_URL}/projects/${projectId}/members/${userId}`);
  }
}
