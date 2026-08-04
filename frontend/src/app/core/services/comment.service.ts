import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { API_BASE_URL } from '../api.config';
import { TaskComment, TaskCommentCreateRequest } from '../models/comment.model';

@Injectable({ providedIn: 'root' })
export class CommentService {
  constructor(private http: HttpClient) {}

  listForTask(taskId: number): Observable<TaskComment[]> {
    return this.http.get<TaskComment[]>(`${API_BASE_URL}/tasks/${taskId}/comments`);
  }

  createComment(taskId: number, request: TaskCommentCreateRequest): Observable<TaskComment> {
    return this.http.post<TaskComment>(`${API_BASE_URL}/tasks/${taskId}/comments`, request);
  }

  deleteComment(commentId: number): Observable<void> {
    return this.http.delete<void>(`${API_BASE_URL}/comments/${commentId}`);
  }
}
