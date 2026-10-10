/**
 * Review notes that are internal to RudCo: AI-provider diagnostics, security
 * screening and our own margin-vs-benchmark position. They stay in the review
 * workspace and are never printed on the customer's quotation.
 */
const INTERNAL_NOTE = /\b(?:Jev|Nicrron|TypeSafe)\b|prompt-injection|benchmark|target margin|The document names the customer/i;

export function customerNotes(warnings: string[]): string[] {
  return warnings.filter((w) => !INTERNAL_NOTE.test(w));
}
