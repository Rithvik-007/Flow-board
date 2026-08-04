import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { forkJoin, map, of, switchMap } from 'rxjs';
import { ProjectService } from '../../core/services/project.service';
import { TaskService } from '../../core/services/task.service';
import { AuthService } from '../../core/services/auth.service';
import { Project, ProjectMember } from '../../core/models/project.model';
import { Task } from '../../core/models/task.model';
import { RelativeTimePipe } from '../../core/pipes/relative-time.pipe';

interface ProjectCardData {
  project: Project;
  taskCount: number;
  doneCount: number;
  lastActive: string | null;
  visibleMembers: ProjectMember[];
  overflowCount: number;
}

// Purely decorative column/chip-height presets for each card's mini board preview —
// not derived from real task data, just enough variety that cards don't look identical.
const MINI_BOARD_PATTERNS: number[][][] = [
  [[55], [80, 35], [45]],
  [[70, 30], [50], [60, 25]],
  [[40], [65, 20], [75]],
];

@Component({
  selector: 'app-projects',
  imports: [ReactiveFormsModule, RouterLink, RelativeTimePipe],
  templateUrl: './projects.html',
  styleUrl: './projects.css',
})
export class Projects implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly projectService = inject(ProjectService);
  private readonly taskService = inject(TaskService);
  private readonly authService = inject(AuthService);

  readonly cards = signal<ProjectCardData[]>([]);
  readonly loaded = signal(false);
  readonly showCreateForm = signal(false);

  // One list per non-empty group, in display order — the template loops over
  // this once instead of duplicating the same section markup per group.
  readonly sections = computed(() => {
    const userId = this.authService.currentUser()?.id;
    const owned = this.cards().filter((c) => c.project.owner_id === userId);
    const shared = this.cards().filter((c) => c.project.owner_id !== userId);

    const groups: { title: string; cards: ProjectCardData[] }[] = [];
    if (owned.length > 0) groups.push({ title: 'Owned by me', cards: owned });
    if (shared.length > 0) groups.push({ title: 'Shared with me', cards: shared });
    return groups;
  });

  readonly form = this.fb.group({
    name: ['', [Validators.required]],
    description: [''],
  });

  ngOnInit(): void {
    this.loadProjects();
  }

  loadProjects(): void {
    this.loaded.set(false);
    this.projectService
      .listProjects()
      .pipe(
        switchMap((projects) => {
          if (projects.length === 0) return of([]);
          return forkJoin(
            projects.map((project) =>
              forkJoin([
                this.taskService.listProjectTasks(project.id),
                this.projectService.listMembers(project.id),
              ]).pipe(map(([tasks, members]) => this.buildCard(project, tasks, members))),
            ),
          );
        }),
      )
      .subscribe((cards) => {
        this.cards.set(cards);
        this.loaded.set(true);
      });
  }

  private buildCard(project: Project, tasks: Task[], members: ProjectMember[]): ProjectCardData {
    const doneCount = tasks.filter((t) => t.status === 'done').length;
    const lastActive = tasks.length
      ? tasks.map((t) => t.created_at).sort().at(-1)!
      : null;
    const visibleMembers = members.slice(0, 3);
    const overflowCount = Math.max(0, members.length - visibleMembers.length);

    return {
      project,
      taskCount: tasks.length,
      doneCount,
      lastActive,
      visibleMembers,
      overflowCount,
    };
  }

  miniBoardPattern(projectId: number): number[][] {
    return MINI_BOARD_PATTERNS[projectId % MINI_BOARD_PATTERNS.length];
  }

  initials(name: string): string {
    return name
      .split(' ')
      .map((part) => part[0])
      .join('')
      .slice(0, 2)
      .toUpperCase();
  }

  submit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const { name, description } = this.form.getRawValue();
    this.projectService.createProject({ name: name!, description: description || null }).subscribe(() => {
      this.form.reset();
      this.showCreateForm.set(false);
      this.loadProjects();
    });
  }
}
