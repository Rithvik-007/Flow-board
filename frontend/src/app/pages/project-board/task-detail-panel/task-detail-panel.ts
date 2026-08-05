import { TitleCasePipe } from '@angular/common';
import { Component, computed, effect, inject, input, output, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RelativeTimePipe } from '../../../core/pipes/relative-time.pipe';
import { AuthService } from '../../../core/services/auth.service';
import { CommentService } from '../../../core/services/comment.service';
import { SubtaskService } from '../../../core/services/subtask.service';
import { TaskService } from '../../../core/services/task.service';
import { WsEvent } from '../../../core/services/websocket.service';
import { TaskComment } from '../../../core/models/comment.model';
import { Subtask } from '../../../core/models/subtask.model';
import { Task, TaskPriority } from '../../../core/models/task.model';

const PRIORITIES: TaskPriority[] = ['low', 'medium', 'high'];

@Component({
  selector: 'app-task-detail-panel',
  imports: [ReactiveFormsModule, RelativeTimePipe, TitleCasePipe],
  templateUrl: './task-detail-panel.html',
  styleUrl: './task-detail-panel.css',
})
export class TaskDetailPanel {
  private readonly fb = inject(FormBuilder);
  private readonly subtaskService = inject(SubtaskService);
  private readonly commentService = inject(CommentService);
  private readonly taskService = inject(TaskService);
  private readonly authService = inject(AuthService);

  readonly task = input.required<Task>();
  readonly isViewer = input<boolean>(false);
  readonly wsEvent = input<WsEvent | null>(null);
  readonly closed = output<void>();
  // The task itself is owned by the board, not this panel, so a priority change
  // is reported upward instead of mutated locally — see ProjectBoard.onTaskUpdated.
  readonly taskUpdated = output<Task>();

  readonly priorities = PRIORITIES;

  readonly subtasks = signal<Subtask[]>([]);
  readonly comments = signal<TaskComment[]>([]);
  readonly currentUserId = computed(() => this.authService.currentUser()?.id ?? null);

  readonly subtaskForm = this.fb.group({
    title: ['', [Validators.required]],
  });

  readonly commentForm = this.fb.group({
    content: ['', [Validators.required]],
  });

  readonly dueDateForm = this.fb.group({
    due_date: [''],
    due_time: [''],
  });

  constructor() {
    // task is a signal input, so this effect automatically reruns whenever
    // the panel is pointed at a different task.
    effect(() => {
      const taskId = this.task().id;
      this.loadSubtasks(taskId);
      this.loadComments(taskId);
    });

    // Live updates from other users: only react if the event is about the task
    // this panel is currently showing — otherwise it's not our concern here.
    effect(() => {
      const event = this.wsEvent();
      if (!event || event.task_id !== this.task().id) return;

      if (event.event.startsWith('subtask_')) {
        this.loadSubtasks(event.task_id);
      } else if (event.event.startsWith('comment_')) {
        this.loadComments(event.task_id);
      }
    });

    // Keep the due-date fields in sync whenever the panel is pointed at a
    // different task, or this task's own due_date changes underneath it.
    effect(() => {
      const { date, time } = this.splitDueDate(this.task().due_date);
      this.dueDateForm.setValue({ due_date: date, due_time: time }, { emitEvent: false });
    });
  }

  changePriority(priority: TaskPriority): void {
    this.taskService.updateTask(this.task().id, { priority }).subscribe((updated) => {
      this.taskUpdated.emit(updated);
    });
  }

  saveDueDate(): void {
    const { due_date, due_time } = this.dueDateForm.getRawValue();
    this.taskService.updateTask(this.task().id, { due_date: this.combineDateTime(due_date, due_time) }).subscribe(
      (updated) => this.taskUpdated.emit(updated),
    );
  }

  clearDueDate(): void {
    this.dueDateForm.setValue({ due_date: '', due_time: '' }, { emitEvent: false });
    this.taskService.updateTask(this.task().id, { due_date: null }).subscribe((updated) => {
      this.taskUpdated.emit(updated);
    });
  }

  private combineDateTime(date: string | null | undefined, time: string | null | undefined): string | null {
    if (!date) return null;
    return new Date(`${date}T${time || '00:00'}:00`).toISOString();
  }

  // Mirrors the "midnight = no specific time" convention DueDatePipe uses for display,
  // so a due date saved without a time round-trips back into the form the same way.
  private splitDueDate(dueDate: string | null): { date: string; time: string } {
    if (!dueDate) return { date: '', time: '' };
    const d = new Date(dueDate);
    const pad = (n: number) => String(n).padStart(2, '0');
    const date = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    const hasTime = d.getHours() !== 0 || d.getMinutes() !== 0;
    const time = hasTime ? `${pad(d.getHours())}:${pad(d.getMinutes())}` : '';
    return { date, time };
  }

  private loadSubtasks(taskId: number): void {
    this.subtaskService.listForTask(taskId).subscribe((subtasks) => this.subtasks.set(subtasks));
  }

  private loadComments(taskId: number): void {
    this.commentService.listForTask(taskId).subscribe((comments) => this.comments.set(comments));
  }

  addSubtask(): void {
    if (this.subtaskForm.invalid) {
      this.subtaskForm.markAllAsTouched();
      return;
    }
    const { title } = this.subtaskForm.getRawValue();
    this.subtaskService.createSubtask(this.task().id, { title: title! }).subscribe((subtask) => {
      this.subtasks.update((current) => [...current, subtask]);
      this.subtaskForm.reset();
    });
  }

  toggleSubtask(subtask: Subtask): void {
    this.subtaskService
      .updateSubtask(subtask.id, { is_complete: !subtask.is_complete })
      .subscribe((updated) => {
        this.subtasks.update((current) => current.map((s) => (s.id === updated.id ? updated : s)));
      });
  }

  deleteSubtask(subtask: Subtask): void {
    this.subtaskService.deleteSubtask(subtask.id).subscribe(() => {
      this.subtasks.update((current) => current.filter((s) => s.id !== subtask.id));
    });
  }

  addComment(): void {
    if (this.commentForm.invalid) {
      this.commentForm.markAllAsTouched();
      return;
    }
    const { content } = this.commentForm.getRawValue();
    this.commentService.createComment(this.task().id, { content: content! }).subscribe((comment) => {
      this.comments.update((current) => [...current, comment]);
      this.commentForm.reset();
    });
  }

  deleteComment(comment: TaskComment): void {
    this.commentService.deleteComment(comment.id).subscribe(() => {
      this.comments.update((current) => current.filter((c) => c.id !== comment.id));
    });
  }

  initials(name: string): string {
    return name
      .split(' ')
      .map((part) => part[0])
      .join('')
      .slice(0, 2)
      .toUpperCase();
  }
}
