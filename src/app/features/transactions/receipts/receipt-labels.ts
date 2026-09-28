/** "845 kB", "1.2 MB", in the locale's number format. */
export function formatFileSize(bytes: number, locale: string): string {
  const [value, unit] =
    bytes >= 1024 * 1024
      ? [bytes / 1024 / 1024, 'megabyte']
      : [Math.max(1, bytes / 1024), 'kilobyte'];
  return new Intl.NumberFormat(locale, {
    style: 'unit',
    unit,
    unitDisplay: 'short',
    maximumFractionDigits: value < 10 ? 1 : 0,
  }).format(value);
}

/** "1 receipt", "3 receipts". */
export function receipts(count: number): string {
  return `${count} ${count === 1 ? 'receipt' : 'receipts'}`;
}
