// Browser only: the files of a drag and drop, including the contents of dropped folders where the
// browser supports it (webkitGetAsEntry: Chrome, Edge, Firefox and Safari). Each file keeps its path
// inside the folder so a folder with subfolders still sorts in a stable order.

export type DroppedFile = { file: File; name: string; path: string };

function readAll(reader: FileSystemDirectoryReader): Promise<FileSystemEntry[]> {
  // readEntries returns at most ~100 entries per call: keep reading until it returns none.
  return new Promise((resolve, reject) => {
    const out: FileSystemEntry[] = [];
    const next = () =>
      reader.readEntries((batch) => {
        if (batch.length === 0) resolve(out);
        else {
          out.push(...batch);
          next();
        }
      }, reject);
    next();
  });
}

async function walk(entry: FileSystemEntry, depth: number): Promise<DroppedFile[]> {
  if (entry.isFile) {
    const file = await new Promise<File>((resolve, reject) => (entry as FileSystemFileEntry).file(resolve, reject));
    return [{ file, name: file.name, path: entry.fullPath }];
  }
  if (entry.isDirectory && depth < 3) {
    const children = await readAll((entry as FileSystemDirectoryEntry).createReader());
    return (await Promise.all(children.map((c) => walk(c, depth + 1)))).flat();
  }
  return [];
}

/** Files from a drop event. Falls back to dataTransfer.files when folders cannot be read. */
export async function filesFromDrop(dt: DataTransfer): Promise<DroppedFile[]> {
  // Captured before any await: the browser empties the DataTransfer once the drop handler yields.
  const plain = [...dt.files].map((file) => ({ file, name: file.name, path: file.name }));
  const entries = [...dt.items]
    .filter((i) => i.kind === "file")
    .map((i) => (typeof i.webkitGetAsEntry === "function" ? i.webkitGetAsEntry() : null));
  if (entries.length > 0 && entries.every((e) => e != null)) {
    try {
      return (await Promise.all(entries.map((e) => walk(e!, 0)))).flat();
    } catch {
      // Fall through to the plain file list.
    }
  }
  return plain;
}
