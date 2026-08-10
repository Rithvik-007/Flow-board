import { DueDatePipe } from './due-date.pipe';

describe('DueDatePipe', () => {
  let pipe: DueDatePipe;

  // Pinned so "Today"/"Tomorrow"/"Next week" are deterministic regardless of
  // when the test suite actually runs. Wednesday, so weekday-name buckets below
  // don't collide with "Today"/"Tomorrow" at the edges.
  const FIXED_NOW = new Date(2026, 5, 17, 9, 0, 0); // Wed, June 17 2026, 9:00 AM

  function daysFromNow(days: number, hours = 0, minutes = 0): Date {
    return new Date(
      FIXED_NOW.getFullYear(),
      FIXED_NOW.getMonth(),
      FIXED_NOW.getDate() + days,
      hours,
      minutes,
    );
  }

  beforeEach(() => {
    pipe = new DueDatePipe();
    jasmine.clock().install();
    jasmine.clock().mockDate(FIXED_NOW);
  });

  afterEach(() => {
    jasmine.clock().uninstall();
  });

  it('returns null for a null due date', () => {
    expect(pipe.transform(null)).toBeNull();
  });

  it('returns "Today" for a due date with no specific time today', () => {
    expect(pipe.transform(daysFromNow(0).toISOString())).toBe('Today');
  });

  it('returns "Today, <time>" for a due date with a specific time today', () => {
    const result = pipe.transform(daysFromNow(0, 14, 30).toISOString());
    expect(result).toContain('Today,');
    expect(result).toContain('2:30');
  });

  it('returns "Tomorrow" for a due date exactly one day out', () => {
    expect(pipe.transform(daysFromNow(1).toISOString())).toBe('Tomorrow');
  });

  it('returns the weekday name for a due date 2-7 days out', () => {
    const due = daysFromNow(3);
    const expected = due.toLocaleDateString('en-US', { weekday: 'long' });
    expect(pipe.transform(due.toISOString())).toBe(expected);
  });

  it('returns "Next week" for a due date 8-14 days out', () => {
    expect(pipe.transform(daysFromNow(10).toISOString())).toBe('Next week');
    expect(pipe.transform(daysFromNow(8).toISOString())).toBe('Next week');
    expect(pipe.transform(daysFromNow(14).toISOString())).toBe('Next week');
  });

  it('falls back to a short month/day date beyond 14 days out', () => {
    const due = daysFromNow(30);
    const expected = due.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    expect(pipe.transform(due.toISOString())).toBe(expected);
  });

  it('falls back to the same short date format for an overdue (past) date', () => {
    // The pipe only formats the date string — it doesn't decide overdue styling
    // itself (that's ProjectBoard.isOverdue + the .overdue CSS class), but a
    // past date should still render sensibly rather than as "Next week" or blank.
    const due = daysFromNow(-5);
    const expected = due.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    expect(pipe.transform(due.toISOString())).toBe(expected);
  });
});
