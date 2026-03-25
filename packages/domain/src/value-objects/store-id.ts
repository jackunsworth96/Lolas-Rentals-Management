export class StoreId {
  readonly value: string;

  private constructor(value: string) {
    if (!value || value.trim().length === 0) {
      throw new Error('StoreId cannot be empty');
    }
    this.value = value.trim();
    Object.freeze(this);
  }

  static from(value: string): StoreId {
    return new StoreId(value);
  }

  equals(other: StoreId): boolean {
    return this.value === other.value;
  }

  toString(): string {
    return this.value;
  }
}
