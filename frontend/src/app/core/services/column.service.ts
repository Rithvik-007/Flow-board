import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { API_BASE_URL } from '../api.config';
import {
  Column,
  ColumnCreateRequest,
  ColumnReorderRequest,
  ColumnUpdateRequest,
} from '../models/column.model';

@Injectable({ providedIn: 'root' })
export class ColumnService {
  constructor(private http: HttpClient) {}

  createColumn(projectId: number, request: ColumnCreateRequest): Observable<Column> {
    return this.http.post<Column>(`${API_BASE_URL}/projects/${projectId}/columns`, request);
  }

  updateColumn(columnId: number, request: ColumnUpdateRequest): Observable<Column> {
    return this.http.patch<Column>(`${API_BASE_URL}/columns/${columnId}`, request);
  }

  deleteColumn(columnId: number): Observable<void> {
    return this.http.delete<void>(`${API_BASE_URL}/columns/${columnId}`);
  }

  reorderColumns(projectId: number, request: ColumnReorderRequest): Observable<Column[]> {
    return this.http.patch<Column[]>(`${API_BASE_URL}/projects/${projectId}/columns/reorder`, request);
  }
}
