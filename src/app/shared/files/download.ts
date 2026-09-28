/**
 * An object URL for showing a file, or undefined where the browser can't make
 * one. Revoke it with `URL.revokeObjectURL` once it's no longer shown.
 */
export function objectUrl(blob: Blob): string | undefined {
  try {
    return URL.createObjectURL(blob);
  } catch {
    return undefined;
  }
}

/**
 * Hands a file to the browser to save, as exports, backups and receipt
 * downloads do. Works offline, since the file is made on the device.
 */
export function saveFile(blob: Blob, fileName: string): void {
  const url = objectUrl(blob);
  if (!url) throw new Error('Saving files is not supported here.');
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.rel = 'noopener';
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  link.remove();
  // Some browsers read the URL after click() returns.
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

/** Reads a picked file as text, UTF-8 by default. */
export function readText(file: Blob): Promise<string> {
  if (typeof file.text === 'function') return file.text();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.onerror = () => reject(reader.error);
    reader.readAsText(file);
  });
}
