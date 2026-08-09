import { TitleCasePipe } from '@angular/common';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';
import { ProjectService } from '../../core/services/project.service';
import { InvitableRole, ProjectDetail, ProjectMember } from '../../core/models/project.model';

@Component({
  selector: 'app-project-settings',
  imports: [ReactiveFormsModule, RouterLink, TitleCasePipe],
  templateUrl: './project-settings.html',
  styleUrl: './project-settings.css',
})
export class ProjectSettings implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly projectService = inject(ProjectService);
  private readonly authService = inject(AuthService);
  private readonly fb = inject(FormBuilder);

  readonly project = signal<ProjectDetail | null>(null);
  readonly members = signal<ProjectMember[]>([]);
  readonly errorMessage = signal<string | null>(null);

  readonly showDeleteConfirm = signal(false);
  readonly deleteConfirmInput = signal('');
  readonly deleteError = signal<string | null>(null);
  // Deletion is irreversible, so it's gated on typing the project's exact
  // name rather than a plain "are you sure?" click.
  readonly isDeleteConfirmed = computed(
    () => this.deleteConfirmInput().trim().length > 0 && this.deleteConfirmInput() === this.project()?.name,
  );

  readonly isOwner = computed(() => {
    const project = this.project();
    const userId = this.authService.currentUser()?.id;
    return !!project && project.owner_id === userId;
  });

  readonly showLeaveConfirm = signal(false);
  readonly leaveError = signal<string | null>(null);

  readonly inviteForm = this.fb.group({
    email: ['', [Validators.required, Validators.email]],
    role: ['member' as InvitableRole, [Validators.required]],
  });
  readonly inviteSentMessage = signal<string | null>(null);

  private projectId!: number;

  ngOnInit(): void {
    this.projectId = Number(this.route.snapshot.paramMap.get('id'));

    // Any member can view this page now (they need it to leave the project) —
    // owner-only sections (invite form, role/remove controls, danger zone) are
    // gated in the template via isOwner(). The API independently enforces every
    // owner-only action regardless of what the UI shows.
    this.projectService.getProject(this.projectId).subscribe((project) => {
      this.project.set(project);
    });

    this.loadMembers();
  }

  loadMembers(): void {
    this.projectService.listMembers(this.projectId).subscribe((members) => this.members.set(members));
  }

  invite(): void {
    if (this.inviteForm.invalid) {
      this.inviteForm.markAllAsTouched();
      return;
    }

    this.errorMessage.set(null);
    this.inviteSentMessage.set(null);
    const { email, role } = this.inviteForm.getRawValue();
    this.projectService.inviteMember(this.projectId, { email: email!, role: role! }).subscribe({
      next: (invite) => {
        // No membership to add yet — the invite is pending until the recipient
        // accepts it (see the invites page), so the member list is left as-is.
        this.inviteSentMessage.set(`Invite sent to ${invite.invited_email}.`);
        this.inviteForm.reset({ email: '', role: 'member' });
      },
      error: (err) => {
        const detail = err?.error?.detail;
        this.errorMessage.set(
          detail === 'This user is already a member of the project' ||
            detail === 'This email already has a pending invite to this project'
            ? detail
            : 'Could not send invite — please try again.',
        );
      },
    });
  }

  changeRole(member: ProjectMember, role: InvitableRole): void {
    this.projectService.updateMemberRole(this.projectId, member.user_id, { role }).subscribe((updated) => {
      this.members.update((current) => current.map((m) => (m.id === updated.id ? updated : m)));
    });
  }

  removeMember(member: ProjectMember): void {
    this.projectService.removeMember(this.projectId, member.user_id).subscribe(() => {
      this.members.update((current) => current.filter((m) => m.id !== member.id));
    });
  }

  isOwnerRow(member: ProjectMember): boolean {
    return member.role === 'owner';
  }

  openDeleteConfirm(): void {
    this.showDeleteConfirm.set(true);
    this.deleteConfirmInput.set('');
    this.deleteError.set(null);
  }

  cancelDelete(): void {
    this.showDeleteConfirm.set(false);
    this.deleteConfirmInput.set('');
  }

  deleteProject(): void {
    if (!this.isDeleteConfirmed()) return;

    this.deleteError.set(null);
    this.projectService.deleteProject(this.projectId).subscribe({
      next: () => this.router.navigate(['/projects']),
      error: () => this.deleteError.set('Could not delete project — please try again.'),
    });
  }

  openLeaveConfirm(): void {
    this.showLeaveConfirm.set(true);
    this.leaveError.set(null);
  }

  cancelLeave(): void {
    this.showLeaveConfirm.set(false);
  }

  leaveProject(): void {
    this.leaveError.set(null);
    this.projectService.leaveProject(this.projectId).subscribe({
      next: () => this.router.navigate(['/projects']),
      error: (err) => {
        this.leaveError.set(err?.error?.detail ?? 'Could not leave project — please try again.');
      },
    });
  }
}
