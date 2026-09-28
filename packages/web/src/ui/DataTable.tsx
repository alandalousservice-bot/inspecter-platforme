import type { ReactNode } from 'react';
import { EmptyState } from './States';

export type DataTableColumn<Row> = {
  id: string;
  header: string;
  render: (row: Row) => ReactNode;
  headerClassName?: string;
};

type DataTableProps<Row> = {
  caption: string;
  columns: DataTableColumn<Row>[];
  rows: Row[];
  rowKey: (row: Row) => string;
  emptyTitle?: string;
  emptyDescription?: string;
};

export function DataTable<Row>({
  caption,
  columns,
  rows,
  rowKey,
  emptyTitle = 'لا توجد بيانات لعرضها',
  emptyDescription,
}: DataTableProps<Row>) {
  if (rows.length === 0) {
    return <EmptyState title={emptyTitle} description={emptyDescription} />;
  }

  return (
    <div className="ui-table-wrap" role="region" aria-label={caption} tabIndex={0}>
      <table className="ui-table">
        <caption>{caption}</caption>
        <thead>
          <tr>
            {columns.map((column) => (
              <th className={column.headerClassName} key={column.id} scope="col">
                {column.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={rowKey(row)}>
              {columns.map((column) => (
                <td key={column.id}>{column.render(row)}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
