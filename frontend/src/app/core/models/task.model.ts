export type TaskStatus = 'todo' | 'in_progress' | 'done';
export type TaskPriority = 'low' | 'medium' | 'high';

export interface Task {
  id: number;
  project_id: number;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  assignee_id: number | null;
  created_by: number;
  due_date: string | null;
  created_at: string;
}

export interface TaskCreateRequest {
  project_id: number;
  title: string;
  description?: string | null;
  assignee_id?: number | null;
  due_date?: string | null;
  status?: TaskStatus;
  priority?: TaskPriority;
}

export interface TaskUpdateRequest {
  title?: string;
  description?: string | null;
  status?: TaskStatus;
  assignee_id?: number | null;
  due_date?: string | null;
  priority?: TaskPriority;
}
