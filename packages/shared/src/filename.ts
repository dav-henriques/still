const RESERVED = /^(con|prn|aux|nul|com[0-9]|lpt[0-9])$/i;
// eslint-disable-next-line no-control-regex
const INVALID = /[<>:"/\\|?*\u0000-\u001f]/g;

/** Make a string safe as a Windows (and POSIX) filename stem. */
export function sanitizeFilename(input: string, fallback = 'untitled'): string {
  let name = input.normalize('NFC').replace(INVALID, ' ').replace(/\s+/g, ' ').trim().replace(/[. ]+$/, '');
  if (name.length > 150) name = name.slice(0, 150).trim().replace(/[. ]+$/, '');
  if (!name) return fallback;
  if (RESERVED.test(name)) return `${name}_`;
  return name;
}

/** "My beat" -> "My beat (2)" -> ... the first stem for which `taken` is false. */
export function uniqueStem(stem: string, taken: (candidate: string) => boolean): string {
  if (!taken(stem)) return stem;
  for (let i = 2; i < 10_000; i++) {
    const candidate = `${stem} (${i})`;
    if (!taken(candidate)) return candidate;
  }
  throw new Error('Could not find a free filename');
}

export function stripExtension(filename: string): string {
  const i = filename.lastIndexOf('.');
  return i > 0 ? filename.slice(0, i) : filename;
}

export function extensionOf(filename: string): string {
  const i = filename.lastIndexOf('.');
  return i > 0 ? filename.slice(i + 1).toLowerCase() : '';
}
