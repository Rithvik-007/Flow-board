export interface Column {
  id: number;
  project_id: number;
  name: string;
  position: number;
  created_at: string;
}

export interface ColumnCreateRequest {
  name: string;
}

export interface ColumnUpdateRequest {
  name: string;
}

export interface ColumnReorderRequest {
  column_ids: number[];
}
