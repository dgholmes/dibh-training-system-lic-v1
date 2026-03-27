/**
 * Web: files are picked via <input type="file"> or drag/drop (user may select from USB removable media).
 * Capacitor (tablet): replace with @capacitor/filesystem + DocumentPicker / copy from USB path into app sandbox,
 * then pass File-like Blob into breathingFileRepository.createBreathingFile.
 */
export function isFileSystemAccessSupported() {
  return typeof showOpenFilePicker === 'function';
}

/** Optional future: web File System Access API for persistent handles */
export async function pickFilesWithFilePicker({ multiple = true, accept } = {}) {
  if (!isFileSystemAccessSupported()) return null;
  const files = await showOpenFilePicker({
    multiple,
    types: accept
      ? [{ description: 'Data files', accept: { 'text/csv': ['.csv'], 'application/octet-stream': ['.vxp'] } }]
      : undefined,
  });
  const out = await Promise.all(files.map((h) => h.getFile()));
  return out;
}
