// Match the pinned Core's source::is_account_alias: ASCII, 1–64 bytes,
// starting with a lowercase letter/digit, then lowercase letters/digits/_/-.
export function validImportAlias(value: string): boolean {
  return value.length <= 64 && /^[a-z0-9]/.test(value) && !/[^a-z0-9_-]/.test(value);
}
