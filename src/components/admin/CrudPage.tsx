import CrudPageClient, {
  type CrudPageProps,
  type DataCell,
  type DataRow,
} from "@/components/admin/CrudPageClient";

/**
 * Server boundary for ERP tables.
 *
 * Server pages may provide render functions for nested Prisma values. Those
 * functions are evaluated here so only serializable rows and column metadata
 * cross into the interactive client component.
 */
export default function CrudPage(props: CrudPageProps) {
  const clientColumns: DataCell[] = props.dataColumns.map(({ key, label }) => ({ key, label }));
  const clientRows: DataRow[] = props.rows.map((row) => {
    const prepared: DataRow = { ...row };
    for (const column of props.dataColumns) {
      if (column.render) prepared[column.key] = column.render(row);
    }
    return prepared;
  });

  return (
    <CrudPageClient
      {...props}
      rows={clientRows}
      dataColumns={clientColumns}
    />
  );
}
