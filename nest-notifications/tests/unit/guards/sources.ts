import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
export const srcRoot = join(packageRoot, 'src');
export const distRoot = join(packageRoot, 'dist');

export interface SourceFile {
  readonly path: string;
  readonly relative: string;
  readonly text: string;
}

export function listFiles(root: string, extensions: readonly string[]): string[] {
  const found: string[] = [];
  const walk = (directory: string): void => {
    for (const entry of readdirSync(directory)) {
      const full = join(directory, entry);
      if (statSync(full).isDirectory()) {
        walk(full);
        continue;
      }
      if (extensions.some((extension) => entry.endsWith(extension))) found.push(full);
    }
  };
  walk(root);
  return found.sort();
}

export function readSources(root: string, extensions: readonly string[] = ['.ts']): SourceFile[] {
  return listFiles(root, extensions).map((path) => ({
    path,
    relative: path.slice(packageRoot.length + 1).replaceAll('\\', '/'),
    text: readFileSync(path, 'utf8'),
  }));
}

/**
 * ESM 산출물은 청크로 쪼개진다 — 엔트리 하나만 훑으면 실제 코드는 다른 파일에 있다.
 * 상대 import를 따라가 그래프 전체를 모은다.
 */
export function readArtifactGraph(entry: string): SourceFile[] {
  const seen = new Map<string, SourceFile>();
  const visit = (path: string): void => {
    if (seen.has(path)) return;
    const text = readFileSync(path, 'utf8');
    seen.set(path, { path, relative: path.slice(packageRoot.length + 1), text });
    for (const match of text.matchAll(/from\s*["'](\.\/[^"']+)["']|require\(["'](\.\/[^"']+)["']\)/gu)) {
      const target = match[1] ?? match[2];
      if (target === undefined) continue;
      visit(join(dirname(path), target));
    }
  };
  visit(entry);
  return [...seen.values()];
}
