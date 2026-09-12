/**
 * Utility to generate and download RFC-4180 compliant CSV files directly from the browser.
 */

export interface CsvColumn<T> {
  header: string;
  accessor: (item: T) => string | number | boolean | null | undefined;
}

export function exportToCsv<T>(filename: string, data: T[], columns: CsvColumn<T>[]): void {
  if (typeof window === 'undefined') return;

  const escapeCell = (value: any): string => {
    if (value === null || value === undefined) return '';
    const str = String(value);
    // If value contains comma, double-quote, or newline, enclose in quotes and escape internal quotes
    if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };

  const headers = columns.map((col) => escapeCell(col.header)).join(',');
  const rows = data.map((item) => {
    return columns.map((col) => escapeCell(col.accessor(item))).join(',');
  });

  const csvContent = [headers, ...rows].join('\r\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);

  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', filename.endsWith('.csv') ? filename : `${filename}.csv`);
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
