interface Column<T> {
  key: string;
  header: string;
  render?: (row: T) => React.ReactNode;
  className?: string;
  /** Applied to `<td>` only. Defaults to `whitespace-nowrap`; set e.g. `whitespace-normal break-words` for wrapped text. */
  cellClassName?: string;
}

interface TableProps<T> {
  columns: Column<T>[];
  data: T[];
  keyFn: (row: T) => string;
  onRowClick?: (row: T) => void;
  getRowClassName?: (row: T) => string;
  emptyMessage?: string;
}

export function Table<T>({ columns, data, keyFn, onRowClick, getRowClassName, emptyMessage = 'No data' }: TableProps<T>) {
  if (data.length === 0) {
    return <div className="py-12 text-center text-sm text-gray-500">{emptyMessage}</div>;
  }

  return (
    <div className="w-full overflow-x-auto rounded-lg border border-gray-200">
      <table className="min-w-full divide-y divide-gray-200">
        <thead className="bg-gray-50">
          <tr>
            {columns.map((col) => (
              <th key={col.key} className={`px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 ${col.className ?? ''}`}>
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-200 bg-white">
          {data.map((row) => (
            <tr
              key={keyFn(row)}
              onClick={() => onRowClick?.(row)}
              className={[onRowClick ? 'cursor-pointer hover:bg-gray-50' : '', getRowClassName?.(row) ?? ''].filter(Boolean).join(' ')}
            >
              {columns.map((col) => (
                <td
                  key={col.key}
                  className={`px-4 py-3 text-sm text-gray-900 align-top ${
                    col.cellClassName ?? 'whitespace-nowrap'
                  } ${col.className ?? ''}`}
                >
                  {col.render ? col.render(row) : String((row as Record<string, unknown>)[col.key] ?? '')}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
