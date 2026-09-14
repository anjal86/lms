import { z } from 'zod';

/**
 * Validates any canonical 32-hex-digit UUID in 8-4-4-4-12 format.
 * Unlike z.string().uuid() (which strictly enforces RFC 4122 version/variant bits),
 * this accepts standard database UUIDs including seed identifiers (e.g. 11111111-1111-1111-1111-111111111111).
 */
export const uuidSchema = z
  .string()
  .regex(/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/, 'Invalid UUID');
