export function formatFileSize(bytes) {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${bytes} B`;
}

export function fileTypeBadge(filename) {
  const m = filename.match(/\.([^.]+)$/i);
  if (!m) return 'FILE';
  return m[1].toUpperCase().slice(0, 4);
}
