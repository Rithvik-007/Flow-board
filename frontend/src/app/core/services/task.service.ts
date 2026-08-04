import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { API_BASE_URL } from '../api.config';
import { Task, TaskCreateRequest, TaskUpdateRequest } from '../models/task.model';

@Injectable({ providedIn: 'root' })
export class TaskService {
  constructor(private http: HttpClient) {}

  listProjectTasks(projectId: number): Observable<Task[]> {
    return this.http.get<Task[]>(`${API_BASE_URL}/projects/${projectId}/tasks`);
  }

  createTask(request: TaskCreateRequest): Observable<Task> {
    return this.http.post<Task>(`${API_BASE_URL}/tasks`, request);
  }

  updateTask(taskId: number, request: TaskUpdateRequest): Observable<Task> {
    return this.http.patch<Task>(`${API_BASE_URL}/tasks/${taskId}`, request);
  }

  deleteTask(taskId: number): Observable<void> {
    return this.http.delete<void>(`${API_BASE_URL}/tasks/${taskId}`);
  }
}
