export type PageQuery = {
  range: (from: number, to: number) => PromiseLike<{ data: unknown[] | null; error: { message: string } | null }>;
};

// PostgREST caps a single response at 1,000 rows, so any query that can grow past
// that (all-time order history in particular) must be paged or it silently truncates.
// `makeQuery` must build a fresh, deterministically ordered query on every call.
export async function fetchAll<T>(makeQuery: () => PageQuery): Promise<T[]> {
  const PAGE = 1000;
  const rows: T[] = [];
  for (let offset = 0; ; offset += PAGE) {
    const { data, error } = await makeQuery().range(offset, offset + PAGE - 1);
    if (error) throw new Error(error.message);
    rows.push(...((data ?? []) as T[]));
    if (!data || data.length < PAGE) return rows;
  }
}
