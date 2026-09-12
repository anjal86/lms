export function extractPhoneNumbers(text: string | null | undefined): string[] {
  if (!text) return [];

  // Keep matches bounded so a 16+ digit booking/account reference cannot be sliced into
  // a phone-looking substring. Supports international prefixes, spaces, dots, dashes,
  // parentheses, and ordinary local numbers.
  const regex = /(?<!\d)(?:(?:\+|00)\d{1,3}[\s.-]?)?(?:\(?\d{2,4}\)?[\s.-]?)?\d{3,4}[\s.-]?\d{3,5}(?!\d)/g;
  const matches = text.match(regex) || [];
  const valid: string[] = [];

  for (const match of matches) {
    const cleaned = match.trim();
    const digitOnly = cleaned.replace(/\D/g, '');
    if (digitOnly.length < 8 || digitOnly.length > 15) continue;
    if (/^\d{4}-\d{2}-\d{2}$/.test(cleaned)) continue;
    if (!valid.includes(cleaned)) valid.push(cleaned);
  }

  return valid;
}
