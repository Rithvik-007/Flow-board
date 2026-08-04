import { User } from './user.model';

// Named TaskComment, not Comment — `Comment` is already a built-in DOM type
// (the node type for HTML comments), and shadowing it gets confusing fast.
export interface TaskComment {
  id: number;
  task_id: number;
  user_id: number;
  content: string;
  created_at: string;
  user: User;
}

export interface TaskCommentCreateRequest {
  content: string;
}
