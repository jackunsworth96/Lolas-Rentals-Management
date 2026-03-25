export class Period {
  readonly start: Date;
  readonly end: Date;

  private constructor(start: Date, end: Date) {
    this.start = start;
    this.end = end;
    Object.freeze(this);
  }

  static firstHalf(year: number, month: number): Period {
    const start = new Date(year, month - 1, 1);
    const end = new Date(year, month - 1, 15, 23, 59, 59, 999);
    return new Period(start, end);
  }

  static secondHalf(year: number, month: number): Period {
    const start = new Date(year, month - 1, 16);
    const end = new Date(year, month, 0, 23, 59, 59, 999);
    return new Period(start, end);
  }

  get isEndOfMonth(): boolean {
    const nextDay = new Date(this.end);
    nextDay.setDate(nextDay.getDate() + 1);
    return nextDay.getDate() === 1;
  }

  contains(date: Date): boolean {
    return date >= this.start && date <= this.end;
  }
}
