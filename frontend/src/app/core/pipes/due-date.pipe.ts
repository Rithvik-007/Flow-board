import { Pipe, PipeTransform } from '@angular/core';

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

@Pipe({ name: 'dueDate' })
export class DueDatePipe implements PipeTransform {
  transform(dueDate: string | null): string | null {
    if (!dueDate) return null;

    const due = new Date(dueDate);
    const diffDays = Math.round((startOfDay(due).getTime() - startOfDay(new Date()).getTime()) / MS_PER_DAY);

    if (diffDays === 0) {
      const hasTime = due.getHours() !== 0 || due.getMinutes() !== 0;
      return hasTime ? `Today, ${this.formatTime(due)}` : 'Today';
    }
    if (diffDays === 1) return 'Tomorrow';
    if (diffDays >= 2 && diffDays <= 7) return due.toLocaleDateString('en-US', { weekday: 'long' });
    if (diffDays >= 8 && diffDays <= 14) return 'Next week';
    return due.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }

  private formatTime(date: Date): string {
    return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  }
}
