import type { ReactNode } from 'react';
import { EmptyState, ErrorState, LoadingState } from './States';

export type DataTableState =
  | { kind: 'loading'; label?: string }
  | { kind: 'error'; title?: string; description?: string; action?: ReactNode }
  | { kind: 'empty'; resultKind?: 'no-data' | 'no-results'; title?: string; description?: string; action?: ReactNode };

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
  state?: DataTableState;
};

export function DataTable<Row>({
  caption,
  columns,
  rows,
  rowKey,
  emptyTitle = 'لا توجد بيانات لعرضها',
  emptyDescription,
  state,
}: DataTableProps<Row>) {
  if (state?.kind === 'loading') return <LoadingState label={state.label} />;
  if (state?.kind === 'error') return <ErrorState title={state.title} description={state.description} action={state.action} />;
  if (rows.length === 0) {
    return <EmptyState
      kind={state?.kind === 'empty' ? state.resultKind : 'no-data'}
      title={state?.kind === 'empty' ? state.title ?? emptyTitle : emptyTitle}
      description={state?.kind === 'empty' ? state.description ?? emptyDescription : emptyDescription}
      action={state?.kind === 'empty' ? state.action : undefined}
    />;
  }

  return (
    <div className="ui-table-region">
      <p className="ui-table__scroll-hint">يمكن تمرير الجدول أفقيًا لعرض بقية الأعمدة.</p>
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
                <td key={column.id}>{(() => {
                  const value = column.render(row);
                  return typeof value === 'string' || typeof value === 'number' ? <bdi dir="auto">{value}</bdi> : value;
                })()}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      </div>
    </div>
  );
}
