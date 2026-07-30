/** Hands `content` to the browser as a file download, then releases the object URL. */
export function downloadBlob(content: string, filename: string, mime: string): void {
  const url = URL.createObjectURL(new Blob([content], { type: mime }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

/** Export filename. Pure, so the likelier mistake (wrong extension) is testable without a DOM. */
export function svgFilename(now: number): string {
  return `infinityboard-${now}.svg`;
}
