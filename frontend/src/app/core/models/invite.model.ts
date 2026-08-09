import { InvitableRole } from './project.model';
import { User } from './user.model';

export type InviteStatus = 'pending' | 'accepted' | 'declined';

export interface Invite {
  id: number;
  project_id: number;
  invited_email: string;
  invited_by: number;
  role: InvitableRole;
  status: InviteStatus;
  created_at: string;
}

export interface MyInvite extends Invite {
  project: { id: number; name: string };
  inviter: User;
}
