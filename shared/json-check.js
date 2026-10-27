/**
 * json-check.js - JSON.parse silently keeps the LAST of two equal keys in an object, so a copy-pasted block that was never renamed
 * (two "13" levels in presets.json, say) quietly replaces the first one. This scans the raw text and reports every duplicate.
 * Pure logic, no Node APIs. Call it on text that already parsed as valid JSON.
 */

/** Returns [{ key, path, line, firstLine }] for every key defined more than once in the same object. */
export function findDuplicateKeys(text) {
  const duplicates = [];
  let i = 0;
  const lineAt = (index) => text.slice(0, index).split('\n').length;
  const skipSpace = () => { while (i < text.length && /\s/.test(text[i])) i++; };
  const readString = () => {
    const start = i++;
    while (text[i] !== '"') i += text[i] === '\\' ? 2 : 1;
    i++;
    return JSON.parse(text.slice(start, i));
  };
  const readValue = (path) => {
    skipSpace();
    if (text[i] === '{') readObject(path);
    else if (text[i] === '[') readArray(path);
    else if (text[i] === '"') readString();
    else while (i < text.length && !/[\s,\]}]/.test(text[i])) i++;   // number, true, false, null
  };
  const readObject = (path) => {
    i++;
    const seen = new Map();
    skipSpace();
    if (text[i] === '}') { i++; return; }
    for (;;) {
      skipSpace();
      const at = i, key = readString();
      skipSpace(); i++;   // the colon
      if (seen.has(key)) duplicates.push({ key, path: path || '(top level)', line: lineAt(at), firstLine: seen.get(key) });
      else seen.set(key, lineAt(at));
      readValue(path ? `${path}.${key}` : key);
      skipSpace();
      if (text[i] === ',') { i++; continue; }
      i++;
      return;
    }
  };
  const readArray = (path) => {
    i++;
    skipSpace();
    if (text[i] === ']') { i++; return; }
    for (;;) {
      readValue(`${path}[]`);
      skipSpace();
      if (text[i] === ',') { i++; continue; }
      i++;
      return;
    }
  };
  readValue('');
  return duplicates;
}

/** Throws a readable Error if the (valid) JSON text contains duplicate keys. */
export function assertNoDuplicateKeys(text, source = 'JSON file') {
  const dups = findDuplicateKeys(text);
  if (!dups.length) return;
  const list = dups.map((d) => `  "${d.key}" in ${d.path}: line ${d.line} repeats line ${d.firstLine}`).join('\n');
  throw new Error(`${source} defines the same key twice (JSON silently keeps only the last one):\n${list}\nRename or remove the duplicate.`);
}
