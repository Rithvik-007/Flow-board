import { Pipe, PipeTransform } from '@angular/core';

const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ['year', 60 * 60 * 24 * 365],
  ['month', 60 * 60 * 24 * 30],
  ['week', 60 * 60 * 24 * 7],
  ['day', 60 * 60 * 24],
  ['hour', 60 * 60],
  ['minute', 60],
];

const formatter = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });

@Pipe({ name: 'relativeTime' })
export class RelativeTimePipe implements PipeTransform {
  transform(isoTimestamp: string): string {
    const secondsAgo = Math.floor((Date.now() - new Date(isoTimestamp).getTime()) / 1000);

    for (const [unit, secondsInUnit] of UNITS) {
      const amount = Math.floor(secondsAgo / secondsInUnit);
      if (amount >= 1) {
        return formatter.format(-amount, unit);
      }
    }
    return 'just now';
  }
}
