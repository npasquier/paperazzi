// Trigger a client-side file download from an in-memory string. The
// blob / object-URL / synthetic-click dance lives here so every export
// path (collection, library, full backup, …) shares one implementation.
export function triggerDownload(
  contents: string,
  filename: string,
  mime: string,
): void {
  const blob = new Blob([contents], { type: mime });
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  window.setTimeout(() => window.URL.revokeObjectURL(url), 0);
}
