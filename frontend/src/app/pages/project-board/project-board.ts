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
import { ColumnService } from '../../core/services/column.service';
import { AuthService } from '../../core/services/auth.service';
import { WebSocketService, WsEvent } from '../../core/services/websocket.service';
import { ProjectDetail, ProjectRole } from '../../core/models/project.model';
import { Column } from '../../core/models/column.model';
import { Task } from '../../core/models/task.model';
import { DueDatePipe } from '../../core/pipes/due-date.pipe';
import { TaskDetailPanel } from './task-detail-panel/task-detail-panel';

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
  private readonly columnService = inject(ColumnService);
  private readonly authService = inject(AuthService);
  private readonly webSocketService = inject(WebSocketService);
  private readonly destroyRef = inject(DestroyRef);

  readonly project = signal<ProjectDetail | null>(null);
  // Columns are user-managed now (not a fixed set), sorted by position.
  readonly boardColumns = signal<Column[]>([]);
  // Tasks bucketed by column id. A plain writable signal (not computed from a
  // flat task list) so drag-and-drop can mutate a column's array in place and
  // then re-set the Map, mirroring how CDK expects to work with the bound arrays.
  readonly tasksByColumn = signal<Map<number, Task[]>>(new Map());
  readonly dropListIds = computed(() => this.boardColumns().map((c) => `dropList-${c.id}`));
  private readonly columnsById = computed(() => new Map(this.boardColumns().map((c) => [c.id, c])));

  // Which column's "+" button was clicked — also which column the add-task
  // form is currently targeting. null means the form is closed.
  readonly addTaskColumnId = signal<number | null>(null);
  readonly errorMessage = signal<string | null>(null);
  readonly selectedTask = signal<Task | null>(null);

  readonly addingColumn = signal(false);
  readonly newColumnName = signal('');
  readonly editingColumnId = signal<number | null>(null);
  readonly editingColumnName = signal('');
  readonly columnError = signal<string | null>(null);

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
    this.projectService.getProject(this.projectId).subscribe((project) => {
      this.project.set(project);
      this.boardColumns.set([...project.columns].sort((a, b) => a.position - b.position));
      this.loadTasks();
    });

    this.webSocketService.connect(this.projectId);
    this.webSocketService.messages$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((event) => {
      this.lastWsEvent.set(event);
      // Task events change what's shown on the board itself; subtask/comment events
      // only matter to whichever task detail panel is open, so those are just
      // forwarded via lastWsEvent for the panel to react to.
      if (event.event === 'task_created' || event.event === 'task_updated' || event.event === 'task_deleted') {
        this.loadTasks();
      } else if (event.event === 'columns_reordered') {
        // The backend excludes the acting user's own sockets from this broadcast
        // (see manager.broadcast's exclude_user_id), so receiving this at all means
        // the reorder came from someone else — always safe to refetch and apply.
        this.refetchColumns();
      } else if (event.event === 'mention_added') {
        // Sent only to the mentioned user (see manager.broadcast_to_user), so a
        // full task refetch is enough to pick up the new has_unread_mentions flag
        // and light up the badge on whichever card it belongs to.
        this.loadTasks();
      }
    });
  }

  ngOnDestroy(): void {
    this.webSocketService.disconnect();
  }

  private groupByColumn(tasks: Task[]): Map<number, Task[]> {
    const map = new Map<number, Task[]>();
    for (const column of this.boardColumns()) map.set(column.id, []);
    for (const task of tasks) {
      const list = map.get(task.column_id);
      if (list) list.push(task);
    }
    return map;
  }

  loadTasks(): void {
    this.taskService.listProjectTasks(this.projectId).subscribe((tasks) => {
      this.tasksByColumn.set(this.groupByColumn(tasks));

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

  tasksFor(columnId: number): Task[] {
    return this.tasksByColumn().get(columnId) ?? [];
  }

  private refetchColumns(): void {
    this.projectService.getProject(this.projectId).subscribe((project) => {
      this.boardColumns.set([...project.columns].sort((a, b) => a.position - b.position));
    });
  }

  openAddTaskForm(columnId: number): void {
    this.addTaskColumnId.set(columnId);
  }

  closeAddTaskForm(): void {
    this.addTaskColumnId.set(null);
    this.taskForm.reset();
  }

  columnLabel(columnId: number | null): string {
    if (columnId === null) return '';
    return this.columnsById().get(columnId)?.name ?? '';
  }

  addTask(): void {
    const columnId = this.addTaskColumnId();
    if (columnId === null) return;

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
        column_id: columnId,
        due_date: this.combineDateTime(due_date, due_time),
      })
      .subscribe((task) => {
        this.tasksByColumn.update((current) => {
          const next = new Map(current);
          next.set(columnId, [task, ...(next.get(columnId) ?? [])]);
          return next;
        });
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

  // Columns are freeform now, so there's no structural "done" state to check.
  // As a pragmatic default, a column literally named "Done" (case-insensitive —
  // matches the starter column every project gets) suppresses the overdue flag;
  // any other column name doesn't, which fails safe (over-flagging rather than
  // silently hiding a real overdue task).
  isOverdue(task: Task): boolean {
    if (!task.due_date) return false;
    const column = this.columnsById().get(task.column_id);
    if (column?.name.trim().toLowerCase() === 'done') return false;
    return new Date(task.due_date) < new Date();
  }

  deleteTask(task: Task): void {
    this.taskService.deleteTask(task.id).subscribe(() => {
      this.tasksByColumn.update((current) => {
        const next = new Map(current);
        next.set(task.column_id, (next.get(task.column_id) ?? []).filter((t) => t.id !== task.id));
        return next;
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
    this.tasksByColumn.update((current) => {
      const next = new Map(current);
      const targetList = next.get(updated.column_id);

      if (targetList && targetList.some((t) => t.id === updated.id)) {
        next.set(updated.column_id, targetList.map((t) => (t.id === updated.id ? updated : t)));
        return next;
      }

      // The task's column changed since this map was last built (e.g. moved from
      // another tab) — remove it from wherever it currently sits and append it
      // to its new column instead of replacing in place.
      for (const [columnId, list] of next) {
        if (list.some((t) => t.id === updated.id)) {
          next.set(columnId, list.filter((t) => t.id !== updated.id));
        }
      }
      next.set(updated.column_id, [...(next.get(updated.column_id) ?? []), updated]);
      return next;
    });
  }

  onDeleteClick(event: Event, task: Task): void {
    // Stop the card's own (click) — which opens the detail panel — from
    // also firing when the Delete button inside the card is clicked.
    event.stopPropagation();
    this.deleteTask(task);
  }

  drop(event: CdkDragDrop<Task[]>, targetColumnId: number): void {
    const previousList = event.previousContainer.data;
    const currentList = event.container.data;

    // Dropped in the same column: just reorder, no column change, no API call.
    if (event.previousContainer === event.container) {
      moveItemInArray(currentList, event.previousIndex, event.currentIndex);
      this.tasksByColumn.update((current) => new Map(current));
      return;
    }

    const task = event.item.data as Task;
    const previousColumnId = task.column_id;

    // Optimistic update: move the task in the UI immediately, before the API confirms it.
    transferArrayItem(previousList, currentList, event.previousIndex, event.currentIndex);
    task.column_id = targetColumnId;
    this.tasksByColumn.update((current) => new Map(current));

    this.taskService.updateTask(task.id, { column_id: targetColumnId }).subscribe({
      error: () => {
        // Revert: move the task back to where it came from and restore its column.
        transferArrayItem(currentList, previousList, event.currentIndex, event.previousIndex);
        task.column_id = previousColumnId;
        this.tasksByColumn.update((current) => new Map(current));
        this.errorMessage.set('Could not move task — please try again.');
        setTimeout(() => this.errorMessage.set(null), 3000);
      },
    });
  }

  dropColumn(event: CdkDragDrop<Column[]>): void {
    if (event.previousIndex === event.currentIndex) return;

    const previousOrder = this.boardColumns();
    const reordered = [...previousOrder];
    moveItemInArray(reordered, event.previousIndex, event.currentIndex);

    // Optimistic update, same pattern as task drag-and-drop: reorder locally first,
    // persist in the background, revert on failure.
    this.boardColumns.set(reordered);

    this.columnService
      .reorderColumns(this.projectId, { column_ids: reordered.map((c) => c.id) })
      .subscribe({
        error: () => {
          this.boardColumns.set(previousOrder);
          this.columnError.set('Could not reorder columns — please try again.');
          setTimeout(() => this.columnError.set(null), 3000);
        },
      });
  }

  startAddColumn(): void {
    this.addingColumn.set(true);
  }

  cancelAddColumn(): void {
    this.addingColumn.set(false);
    this.newColumnName.set('');
  }

  submitAddColumn(): void {
    const name = this.newColumnName().trim();
    if (!name) return;

    this.columnService.createColumn(this.projectId, { name }).subscribe((column) => {
      this.boardColumns.update((cols) => [...cols, column]);
      this.tasksByColumn.update((current) => {
        const next = new Map(current);
        next.set(column.id, []);
        return next;
      });
      this.cancelAddColumn();
    });
  }

  startEditColumn(column: Column): void {
    this.editingColumnId.set(column.id);
    this.editingColumnName.set(column.name);
  }

  cancelEditColumn(): void {
    this.editingColumnId.set(null);
  }

  saveColumnName(column: Column): void {
    const name = this.editingColumnName().trim();
    if (!name || name === column.name) {
      this.editingColumnId.set(null);
      return;
    }

    this.columnService.updateColumn(column.id, { name }).subscribe((updated) => {
      this.boardColumns.update((cols) => cols.map((c) => (c.id === updated.id ? updated : c)));
      this.editingColumnId.set(null);
    });
  }

  deleteColumn(column: Column): void {
    this.columnError.set(null);
    this.columnService.deleteColumn(column.id).subscribe({
      next: () => {
        this.boardColumns.update((cols) => cols.filter((c) => c.id !== column.id));
        this.tasksByColumn.update((current) => {
          const next = new Map(current);
          next.delete(column.id);
          return next;
        });
      },
      error: (err) => {
        this.columnError.set(err?.error?.detail ?? 'Could not delete column — please try again.');
        setTimeout(() => this.columnError.set(null), 4000);
      },
    });
  }
}
