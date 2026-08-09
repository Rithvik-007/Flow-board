export type TaskPriority = 'low' | 'medium' | 'high';

export interface Task {
  id: number;
  project_id: number;
  title: string;
  description: string | null;
  column_id: number;
  priority: TaskPriority;
  assignee_id: number | null;
  created_by: number;
  due_date: string | null;
  created_at: string;
  has_unread_mentions: boolean;
}

export interface TaskCreateRequest {
  project_id: number;
  title: string;
  description?: string | null;
  assignee_id?: number | null;
  due_date?: string | null;
  column_id: number;
  priority?: TaskPriority;
}

export interface TaskUpdateRequest {
  title?: string;
  description?: string | null;
  column_id?: number;
  assignee_id?: number | null;
  due_date?: string | null;
  priority?: TaskPriority;
}
