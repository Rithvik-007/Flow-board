import { TitleCasePipe } from '@angular/common';
import { Component, ElementRef, computed, effect, inject, input, output, signal, viewChild } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RelativeTimePipe } from '../../../core/pipes/relative-time.pipe';
import { AuthService } from '../../../core/services/auth.service';
import { CommentService } from '../../../core/services/comment.service';
import { SubtaskService } from '../../../core/services/subtask.service';
import { TaskService } from '../../../core/services/task.service';
import { WsEvent } from '../../../core/services/websocket.service';
import { TaskComment } from '../../../core/models/comment.model';
import { ProjectMember } from '../../../core/models/project.model';
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
  readonly isOwner = input<boolean>(false);
  readonly members = input<ProjectMember[]>([]);
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

  readonly isEditing = signal(false);

  readonly titleDescForm = this.fb.group({
    title: ['', [Validators.required]],
    description: [''],
  });

  readonly commentInputRef = viewChild<ElementRef<HTMLTextAreaElement>>('commentInput');

  // null = dropdown closed. Set the moment the user types "@" and cleared on
  // selection, Escape, or posting — see onCommentInput/selectMention below.
  private readonly mentionStart = signal<number | null>(null);
  readonly mentionQuery = signal<string | null>(null);
  readonly mentionCandidates = computed(() => {
    const query = this.mentionQuery();
    if (query === null) return [];
    const needle = query.toLowerCase();
    return this.members()
      .filter((m) => m.user.name.toLowerCase().includes(needle))
      .slice(0, 6);
  });

  constructor() {
    // task is a signal input, so this effect automatically reruns whenever
    // the panel is pointed at a different task.
    effect(() => {
      const taskId = this.task().id;
      this.loadSubtasks(taskId);
      this.loadComments(taskId);
      // Switching to a different task while mid-edit would otherwise leave the
      // edit form open showing the previous task's (now stale) values.
      this.isEditing.set(false);
      this.closeMentionDropdown();
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

  startEditing(): void {
    this.titleDescForm.setValue({
      title: this.task().title,
      description: this.task().description ?? '',
    });
    this.isEditing.set(true);
  }

  cancelEditing(): void {
    this.isEditing.set(false);
  }

  saveTitleDesc(): void {
    if (this.titleDescForm.invalid) {
      this.titleDescForm.markAllAsTouched();
      return;
    }
    const { title, description } = this.titleDescForm.getRawValue();
    this.taskService
      .updateTask(this.task().id, { title: title!, description: description || null })
      .subscribe((updated) => {
        this.taskUpdated.emit(updated);
        this.isEditing.set(false);
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
    this.commentService.listForTask(taskId).subscribe((comments) => {
      this.comments.set(comments);

      // Fetching a task's comments marks the current user's mentions on it as read
      // server-side (see GET /tasks/{id}/comments) — mirror that here so the board's
      // badge for this task clears immediately instead of waiting for a full reload.
      // Guarded by id in case the panel has since moved on to a different task
      // before this response came back.
      const current = this.task();
      if (current.id === taskId && current.has_unread_mentions) {
        this.taskUpdated.emit({ ...current, has_unread_mentions: false });
      }
    });
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
      this.closeMentionDropdown();
    });
  }

  // Scans backwards from the cursor for an "@" that starts the token currently
  // being typed. The query itself stops at the first whitespace — multi-word
  // member names are matched by "contains" against that partial query, then the
  // full name (spaces included) is inserted whole on selection, so the user only
  // ever has to type a fragment, never the exact full name.
  onCommentInput(event: Event): void {
    const el = event.target as HTMLTextAreaElement;
    const value = el.value;
    const cursor = el.selectionStart ?? value.length;

    let i = cursor - 1;
    while (i >= 0) {
      const char = value[i];
      if (char === '@') {
        const precededByBoundary = i === 0 || /\s/.test(value[i - 1]);
        if (precededByBoundary) {
          this.mentionStart.set(i);
          this.mentionQuery.set(value.slice(i + 1, cursor));
        } else {
          this.closeMentionDropdown();
        }
        return;
      }
      if (/\s/.test(char)) break;
      i--;
    }
    this.closeMentionDropdown();
  }

  closeMentionDropdown(): void {
    this.mentionStart.set(null);
    this.mentionQuery.set(null);
  }

  selectMention(member: ProjectMember): void {
    const start = this.mentionStart();
    if (start === null) return;

    const textarea = this.commentInputRef()?.nativeElement;
    const currentValue = this.commentForm.controls.content.value ?? '';
    const cursor = textarea?.selectionStart ?? currentValue.length;
    const before = currentValue.slice(0, start);
    const after = currentValue.slice(cursor);
    const insertion = `@${member.user.name} `;

    this.commentForm.controls.content.setValue(before + insertion + after);
    this.closeMentionDropdown();

    // setValue above doesn't move the browser's own cursor, so without this the
    // next keystroke would land wherever the caret happened to be before insertion.
    queueMicrotask(() => {
      if (!textarea) return;
      const newCursor = before.length + insertion.length;
      textarea.focus();
      textarea.setSelectionRange(newCursor, newCursor);
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
