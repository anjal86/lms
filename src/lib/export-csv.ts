import { protectSpreadsheetCell } from './csv';

export interface CsvColumn<T> {
  header: string;
  accessor: (item: T) => string | number | boolean | null | undefined;
}

export function exportToCsv<T>(filename: string, data: T[], columns: CsvColumn<T>[]): void {
  if (typeof window === 'undefined') return;

  const escapeCell = (value: unknown): string => {
    const str = protectSpreadsheetCell(value);
    if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };

  const headers = columns.map((column) => escapeCell(column.header)).join(',');
  const rows = data.map((item) => columns.map((column) => escapeCell(column.accessor(item))).join(','));
  const csvContent = [headers, ...rows].join('\r\n');
  const blob = new Blob([`\uFEFF${csvContent}`], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);

  const link = document.createElement('a');
  link.href = url;
  link.download = filename.endsWith('.csv') ? filename : `${filename}.csv`;
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
