import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';
import { ProjectService } from '../../core/services/project.service';
import { InvitableRole, ProjectDetail, ProjectMember } from '../../core/models/project.model';

@Component({
  selector: 'app-project-settings',
  imports: [ReactiveFormsModule, RouterLink],
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

  readonly inviteForm = this.fb.group({
    email: ['', [Validators.required, Validators.email]],
    role: ['member' as InvitableRole, [Validators.required]],
  });

  private projectId!: number;

  ngOnInit(): void {
    this.projectId = Number(this.route.snapshot.paramMap.get('id'));

    this.projectService.getProject(this.projectId).subscribe((project) => {
      this.project.set(project);

      // Client-side gate only — this just decides what renders. If someone reaches this
      // route without being the owner, every mutating request below still 403s at the API,
      // which is the actual boundary.
      const userId = this.authService.currentUser()?.id;
      if (project.owner_id !== userId) {
        this.router.navigate(['/projects', this.projectId]);
        return;
      }
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
    const { email, role } = this.inviteForm.getRawValue();
    this.projectService.inviteMember(this.projectId, { email: email!, role: role! }).subscribe({
      next: (member) => {
        this.members.update((current) => [...current, member]);
        this.inviteForm.reset({ email: '', role: 'member' });
      },
      error: (err) => {
        const detail = err?.error?.detail;
        this.errorMessage.set(
          detail === 'This user is already a member of the project'
            ? detail
            : detail === 'No Flowboard account found for that email'
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
}
