export class DateRange {
  readonly start: Date;
  readonly end: Date;

  private constructor(start: Date, end: Date) {
    if (end < start) {
      throw new Error(
        `Invalid date range: end (${end.toISOString()}) is before start (${start.toISOString()})`,
      );
    }
    this.start = start;
    this.end = end;
    Object.freeze(this);
  }

  static of(start: Date, end: Date): DateRange {
    return new DateRange(start, end);
  }

  contains(date: Date): boolean {
    return date >= this.start && date <= this.end;
  }

  overlaps(other: DateRange): boolean {
    return this.start <= other.end && other.start <= this.end;
  }

  durationDays(): number {
    const ms = this.end.getTime() - this.start.getTime();
    return Math.ceil(ms / (1000 * 60 * 60 * 24));
  }
}
