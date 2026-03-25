export function toSnakeCase(str: string): string {
  return str.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);
}

export function toCamelCase(str: string): string {
  return str.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());
}

export function mapRowToEntity<T extends Record<string, unknown>>(
  row: Record<string, unknown>,
): T {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row)) {
    result[toCamelCase(key)] = value;
  }
  return result as T;
}

export function mapEntityToRow(
  entity: Record<string, unknown>,
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(entity)) {
    result[toSnakeCase(key)] = value;
  }
  return result;
}

export function parseDate(value: unknown): Date {
  if (value instanceof Date) return value;
  if (typeof value === 'string' || typeof value === 'number') {
    return new Date(value);
  }
  return new Date();
}
