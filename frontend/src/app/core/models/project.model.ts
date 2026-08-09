import { Column } from './column.model';
import { User } from './user.model';

export type ProjectRole = 'owner' | 'member' | 'viewer';

export interface Project {
  id: number;
  name: string;
  description: string | null;
  owner_id: number;
  created_at: string;
}

export interface ProjectMember {
  id: number;
  user_id: number;
  role: ProjectRole;
  joined_at: string;
  user: User;
}

export interface ProjectDetail extends Project {
  members: ProjectMember[];
  columns: Column[];
}

export interface ProjectCreateRequest {
  name: string;
  description?: string | null;
}

// The API rejects "owner" for both of these — there is exactly one owner,
// assigned at project creation, and it can't be reassigned via these endpoints.
export type InvitableRole = 'member' | 'viewer';

export interface MemberInviteRequest {
  email: string;
  role: InvitableRole;
}

export interface MemberRoleUpdateRequest {
  role: InvitableRole;
}
