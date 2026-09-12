export function extractPhoneNumbers(text: string | null | undefined): string[] {
  if (!text) return [];
  // Matches phone numbers with optional international country codes, spaces, dashes, or parentheses
  const regex = /(?:(?:\+|00)\d{1,3}[\s.-]?)?(?:\(?\d{2,4}\)?[\s.-]?)?\d{3,4}[\s.-]?\d{3,5}\b/g;
  const matches = text.match(regex) || [];
  const valid: string[] = [];
  for (const m of matches) {
    const cleaned = m.trim();
    const digitOnly = cleaned.replace(/\D/g, '');
    // Standard phone lengths: 8 to 15 digits
    if (digitOnly.length >= 8 && digitOnly.length <= 15) {
      // Exclude simple date formats (YYYY-MM-DD)
      if (!/^\d{4}-\d{2}-\d{2}$/.test(cleaned) && !valid.includes(cleaned)) {
        valid.push(cleaned);
      }
    }
  }
  return valid;
}
