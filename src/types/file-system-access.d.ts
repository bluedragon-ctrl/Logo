// Minimal types for the File System Access API (Chrome / Edge; not in TypeScript's
// DOM library yet). ui/files.ts feature-detects it and falls back otherwise.
interface FilePickerAcceptType { description?: string; accept: Record<string, string[]> }
interface FileSystemFileHandle {
  readonly name: string;
  getFile(): Promise<File>;
  createWritable(): Promise<FileSystemWritableFileStream>;
}
interface Window {
  showSaveFilePicker?(options?: { suggestedName?: string; types?: FilePickerAcceptType[] }): Promise<FileSystemFileHandle>;
  showOpenFilePicker?(options?: { types?: FilePickerAcceptType[]; multiple?: boolean }): Promise<FileSystemFileHandle[]>;
}
