import { describe, expect, it } from 'vitest';
import { parseLeadCsv, protectSpreadsheetCell } from './csv';

describe('parseLeadCsv', () => {
  it('preserves quoted commas in currency values', () => {
    const csv = 'Customer Name,Phone,Destination,Budget,Adults\nTanvi Roy,+919811223344,Bali,"$2,500",2';
    const result = parseLeadCsv(csv);
    expect(result.errors).toEqual([]);
    expect(result.leads).toHaveLength(1);
    expect(result.leads[0].budget_range).toBe('$2,500');
    expect(result.leads[0].pax_adults).toBe(2);
  });

  it('rejects rows without required identity fields', () => {
    const result = parseLeadCsv('Customer Name,Phone\nMissing Phone,');
    expect(result.leads).toHaveLength(0);
    expect(result.errors[0]).toContain('required');
  });
});

describe('protectSpreadsheetCell', () => {
  it.each(['=SUM(A1:A2)', '+cmd', '-10+20', '@IMPORTXML'])('prefixes dangerous spreadsheet formula %s', (value) => {
    expect(protectSpreadsheetCell(value)).toBe(`'${value}`);
  });

  it('leaves ordinary text unchanged', () => {
    expect(protectSpreadsheetCell('Kathmandu')).toBe('Kathmandu');
  });
});
