export interface Subtask {
  id: number;
  task_id: number;
  title: string;
  is_complete: boolean;
  created_at: string;
}

export interface SubtaskCreateRequest {
  title: string;
}

export interface SubtaskUpdateRequest {
  title?: string;
  is_complete?: boolean;
}
