import { TitleCasePipe } from '@angular/common';
import { Component, DestroyRef, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule, ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import {
  CdkDragDrop,
  DragDropModule,
  moveItemInArray,
  transferArrayItem,
} from '@angular/cdk/drag-drop';
import { ProjectService } from '../../core/services/project.service';
import { TaskService } from '../../core/services/task.service';
import { AuthService } from '../../core/services/auth.service';
import { WebSocketService, WsEvent } from '../../core/services/websocket.service';
import { ProjectDetail, ProjectRole } from '../../core/models/project.model';
import { Task, TaskStatus } from '../../core/models/task.model';
import { DueDatePipe } from '../../core/pipes/due-date.pipe';
import { TaskDetailPanel } from './task-detail-panel/task-detail-panel';

const STATUSES: { value: TaskStatus; label: string }[] = [
  { value: 'todo', label: 'To Do' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'done', label: 'Done' },
];

type ColumnMap = Record<TaskStatus, Task[]>;

function emptyColumns(): ColumnMap {
  return { todo: [], in_progress: [], done: [] };
}

@Component({
  selector: 'app-project-board',
  imports: [
    ReactiveFormsModule,
    FormsModule,
    RouterLink,
    DragDropModule,
    TaskDetailPanel,
    TitleCasePipe,
    DueDatePipe,
  ],
  templateUrl: './project-board.html',
  styleUrl: './project-board.css',
})
export class ProjectBoard implements OnInit, OnDestroy {
  private readonly route = inject(ActivatedRoute);
  private readonly fb = inject(FormBuilder);
  private readonly projectService = inject(ProjectService);
  private readonly taskService = inject(TaskService);
  private readonly authService = inject(AuthService);
  private readonly webSocketService = inject(WebSocketService);
  private readonly destroyRef = inject(DestroyRef);

  readonly statuses = STATUSES;
  // Every cdkDropList needs a unique id so cdkDropListConnectedTo can link them together.
  readonly dropListIds = STATUSES.map((s) => `dropList-${s.value}`);

  readonly project = signal<ProjectDetail | null>(null);
  readonly columns = signal<ColumnMap>(emptyColumns());
  // Which column's "+" button was clicked — also which status the add-task
  // form is currently targeting. null means the form is closed.
  readonly addTaskStatus = signal<TaskStatus | null>(null);
  readonly errorMessage = signal<string | null>(null);
  readonly selectedTask = signal<Task | null>(null);

  // Derived from the project's own member list (already fetched via getProject),
  // not a separate request. This only controls what the UI shows — the API
  // enforces the same rule independently, see the role-based 403s on the backend.
  readonly myRole = computed<ProjectRole | null>(() => {
    const project = this.project();
    const userId = this.authService.currentUser()?.id ?? null;
    if (!project || userId === null) return null;
    return project.members.find((m) => m.user_id === userId)?.role ?? null;
  });
  readonly isViewer = computed(() => this.myRole() === 'viewer');
  readonly isOwner = computed(() => this.myRole() === 'owner');

  // Latest WS event, forwarded as-is to the task detail panel so it can decide
  // whether it applies to the task it's currently showing.
  readonly lastWsEvent = signal<WsEvent | null>(null);
  readonly connectionLost = this.webSocketService.connectionLost;

  readonly taskForm = this.fb.group({
    title: ['', [Validators.required]],
    description: [''],
    due_date: [''],
    due_time: [''],
  });

  private projectId!: number;

  ngOnInit(): void {
    this.projectId = Number(this.route.snapshot.paramMap.get('id'));
    this.projectService.getProject(this.projectId).subscribe((project) => this.project.set(project));
    this.loadTasks();

    this.webSocketService.connect(this.projectId);
    this.webSocketService.messages$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((event) => {
      this.lastWsEvent.set(event);
      // Task events change what's shown on the board itself; subtask/comment events
      // only matter to whichever task detail panel is open, so those are just
      // forwarded via lastWsEvent for the panel to react to.
      if (event.event === 'task_created' || event.event === 'task_updated' || event.event === 'task_deleted') {
        this.loadTasks();
      }
    });
  }

  ngOnDestroy(): void {
    this.webSocketService.disconnect();
  }

  loadTasks(): void {
    this.taskService.listProjectTasks(this.projectId).subscribe((tasks) => {
      const grouped = emptyColumns();
      for (const task of tasks) {
        grouped[task.status].push(task);
      }
      this.columns.set(grouped);

      // The detail panel's task is a separate signal (see onTaskUpdated) — if it's
      // currently open, keep it in sync too, so a remote edit doesn't leave the open
      // panel showing stale data while the card behind it has already moved on.
      const selected = this.selectedTask();
      if (selected) {
        const fresh = tasks.find((t) => t.id === selected.id);
        if (fresh) this.selectedTask.set(fresh);
      }
    });
  }

  openAddTaskForm(status: TaskStatus): void {
    this.addTaskStatus.set(status);
  }

  closeAddTaskForm(): void {
    this.addTaskStatus.set(null);
    this.taskForm.reset();
  }

  columnLabel(status: TaskStatus | null): string {
    return this.statuses.find((s) => s.value === status)?.label ?? '';
  }

  addTask(): void {
    const status = this.addTaskStatus();
    if (status === null) return;

    if (this.taskForm.invalid) {
      this.taskForm.markAllAsTouched();
      return;
    }

    const { title, description, due_date, due_time } = this.taskForm.getRawValue();
    this.taskService
      .createTask({
        project_id: this.projectId,
        title: title!,
        description: description || null,
        status,
        due_date: this.combineDateTime(due_date, due_time),
      })
      .subscribe((task) => {
        const current = this.columns();
        this.columns.set({ ...current, [status]: [task, ...current[status]] });
        this.closeAddTaskForm();
      });
  }

  // A bare "YYYY-MM-DDTHH:mm:00" (no timezone suffix) is parsed by `Date` as
  // local time, which is exactly the picker's intent — toISOString() then
  // converts that to the UTC instant the backend stores.
  private combineDateTime(date: string | null | undefined, time: string | null | undefined): string | null {
    if (!date) return null;
    return new Date(`${date}T${time || '00:00'}:00`).toISOString();
  }

  isOverdue(task: Task): boolean {
    if (!task.due_date || task.status === 'done') return false;
    return new Date(task.due_date) < new Date();
  }

  deleteTask(task: Task): void {
    this.taskService.deleteTask(task.id).subscribe(() => {
      const current = this.columns();
      this.columns.set({
        ...current,
        [task.status]: current[task.status].filter((t) => t.id !== task.id),
      });
    });
  }

  openTask(task: Task): void {
    this.selectedTask.set(task);
  }

  // The detail panel can't mutate its own `task` input (it's owned here), so it
  // emits the server's response and this is where the board's own state catches up —
  // both the open panel and the card sitting in its column need the new data.
  onTaskUpdated(updated: Task): void {
    this.selectedTask.set(updated);
    this.columns.update((current) => ({
      ...current,
      [updated.status]: current[updated.status].map((t) => (t.id === updated.id ? updated : t)),
    }));
  }

  onDeleteClick(event: Event, task: Task): void {
    // Stop the card's own (click) — which opens the detail panel — from
    // also firing when the Delete button inside the card is clicked.
    event.stopPropagation();
    this.deleteTask(task);
  }

  drop(event: CdkDragDrop<Task[]>, targetStatus: TaskStatus): void {
    const previousList = event.previousContainer.data;
    const currentList = event.container.data;

    // Dropped in the same column: just reorder, no status change, no API call.
    if (event.previousContainer === event.container) {
      moveItemInArray(currentList, event.previousIndex, event.currentIndex);
      this.columns.set({ ...this.columns() });
      return;
    }

    const task = event.item.data as Task;
    const previousStatus = task.status;

    // Optimistic update: move the task in the UI immediately, before the API confirms it.
    transferArrayItem(previousList, currentList, event.previousIndex, event.currentIndex);
    task.status = targetStatus;
    this.columns.set({ ...this.columns() });

    this.taskService.updateTask(task.id, { status: targetStatus }).subscribe({
      error: () => {
        // Revert: move the task back to where it came from and restore its status.
        transferArrayItem(currentList, previousList, event.currentIndex, event.previousIndex);
        task.status = previousStatus;
        this.columns.set({ ...this.columns() });
        this.errorMessage.set('Could not move task — please try again.');
        setTimeout(() => this.errorMessage.set(null), 3000);
      },
    });
  }
}
