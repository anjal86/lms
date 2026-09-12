import Papa from 'papaparse';
import type { Lead } from './types';

export type CsvLeadInput = Partial<Lead> & {
  customer_name: string;
  customer_phone: string;
};

const normalizeHeader = (value: string) => value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');

export function parseLeadCsv(csvText: string): { leads: CsvLeadInput[]; errors: string[] } {
  const result = Papa.parse<Record<string, string>>(csvText, {
    header: true,
    skipEmptyLines: 'greedy',
    transformHeader: normalizeHeader,
  });

  const errors = result.errors.map((error) => `Row ${error.row != null ? error.row + 2 : '?'}: ${error.message}`);
  const leads: CsvLeadInput[] = [];

  result.data.forEach((row, index) => {
    const name = (row.customer_name || row.name || '').trim();
    const phone = (row.phone || row.customer_phone || '').trim();
    if (!name || !phone) {
      errors.push(`Row ${index + 2}: Customer Name and Phone are required.`);
      return;
    }

    const adultsRaw = row.adults || row.pax_adults || '2';
    const adults = Number.parseInt(adultsRaw, 10);
    leads.push({
      customer_name: name,
      customer_phone: phone,
      customer_email: (row.email || row.customer_email || '').trim(),
      destination: (row.destination || '').trim() || 'Unspecified',
      budget_range: (row.budget || row.budget_range || '').trim(),
      travel_dates: (row.dates || row.travel_dates || '').trim() || 'Flexible dates',
      pax_adults: Number.isFinite(adults) && adults >= 0 ? adults : 2,
      source: 'csv_import',
      stage: 'new',
    });
  });

  return { leads, errors };
}

export function protectSpreadsheetCell(value: unknown): string {
  const text = value == null ? '' : String(value);
  return /^[=+\-@]/.test(text) ? `'${text}` : text;
}
