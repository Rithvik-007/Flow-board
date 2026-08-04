import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { API_BASE_URL } from '../api.config';
import { Subtask, SubtaskCreateRequest, SubtaskUpdateRequest } from '../models/subtask.model';

@Injectable({ providedIn: 'root' })
export class SubtaskService {
  constructor(private http: HttpClient) {}

  listForTask(taskId: number): Observable<Subtask[]> {
    return this.http.get<Subtask[]>(`${API_BASE_URL}/tasks/${taskId}/subtasks`);
  }

  createSubtask(taskId: number, request: SubtaskCreateRequest): Observable<Subtask> {
    return this.http.post<Subtask>(`${API_BASE_URL}/tasks/${taskId}/subtasks`, request);
  }

  updateSubtask(subtaskId: number, request: SubtaskUpdateRequest): Observable<Subtask> {
    return this.http.patch<Subtask>(`${API_BASE_URL}/subtasks/${subtaskId}`, request);
  }

  deleteSubtask(subtaskId: number): Observable<void> {
    return this.http.delete<void>(`${API_BASE_URL}/subtasks/${subtaskId}`);
  }
}
