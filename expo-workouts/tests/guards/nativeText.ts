// Swift / Kotlin 텍스트 스캐너 — 설계 §9.3의 네이티브 가드가 쓰는 공용 도구.
//
// TS 쪽 가드는 컴파일러 API로 트리비아를 지우지만(`ast.ts`), Swift·Kotlin에는 그 도구가 없다.
// 그렇다고 날 텍스트를 스캔하면 이 저장소에서는 **구조적으로 오탐한다** — 네이티브 소스의 주석이
// 본문만큼 길고, 금지 토큰(`aggregate(`·`LocalDateTime`·`try!`)이 "왜 쓰지 않는가"를 설명하는
// 주석에 정당하게 등장하기 때문이다. 그래서 여기서 최소 렉서를 돌린다.
//
// ⚠ 문자열 리터럴은 **지우지 않는다**. 금지 대상 중 일부(`ACTION_HEALTH_CONNECT_SETTINGS`)는
//   문자열로 등장할 수 있고, 권한 문자열 같은 것은 검사 대상 자체다. 대신 문자열을 **인식**해서
//   그 안의 `//`(URL의 `https://`)를 주석 시작으로 오독하지 않게 한다 — 이것을 놓치면 스캐너가
//   파일의 나머지 절반을 통째로 지운다.

import { join } from 'node:path';

import { PACKAGE_ROOT, listFiles, read } from './ast';

export type NativeFlavor = 'swift' | 'kotlin';

export const IOS_ROOT = join(PACKAGE_ROOT, 'ios');
export const ANDROID_ROOT = join(PACKAGE_ROOT, 'android', 'src', 'main');

export function listSwiftFiles(): readonly string[] {
  return listFiles(IOS_ROOT, (path) => path.endsWith('.swift'));
}

export function listKotlinFiles(): readonly string[] {
  return listFiles(ANDROID_ROOT, (path) => path.endsWith('.kt'));
}

/**
 * 주석을 **같은 길이의 공백으로** 덮은 텍스트. 줄 번호와 오프셋이 원본과 1:1로 유지된다.
 *
 * 다루는 것: `//` 줄 주석 · `/* *\/` 블록 주석(양 언어 모두 **중첩 가능**) · `"..."` 문자열
 * (역슬래시 이스케이프) · `"""..."""` 멀티라인 문자열 · Kotlin의 `'c'` 문자 리터럴.
 */
export function stripNativeComments(text: string): string {
  const out = text.split('');
  const blank = (start: number, end: number): void => {
    for (let i = start; i < end; i += 1) {
      if (out[i] !== '\n' && out[i] !== '\r') out[i] = ' ';
    }
  };
  let i = 0;
  while (i < text.length) {
    const two = text.slice(i, i + 2);
    if (two === '//') {
      let end = text.indexOf('\n', i);
      if (end < 0) end = text.length;
      blank(i, end);
      i = end;
      continue;
    }
    if (two === '/*') {
      let depth = 1;
      let j = i + 2;
      while (j < text.length && depth > 0) {
        if (text.slice(j, j + 2) === '/*') {
          depth += 1;
          j += 2;
        } else if (text.slice(j, j + 2) === '*/') {
          depth -= 1;
          j += 2;
        } else j += 1;
      }
      blank(i, j);
      i = j;
      continue;
    }
    if (text.slice(i, i + 3) === '"""') {
      const end = text.indexOf('"""', i + 3);
      i = end < 0 ? text.length : end + 3;
      continue;
    }
    if (text[i] === '"' || text[i] === "'") {
      const quote = text[i];
      let j = i + 1;
      while (j < text.length) {
        if (text[j] === '\\') {
          j += 2;
          continue;
        }
        if (text[j] === quote || text[j] === '\n') {
          j += 1;
          break;
        }
        j += 1;
      }
      i = j;
      continue;
    }
    i += 1;
  }
  return out.join('');
}

/**
 * 릴리스 바이너리에 **실제로 들어가는** 텍스트. `#if DEBUG … #endif`(Swift, 중첩 포함)와
 * `if (BuildConfig.DEBUG) { … }`(Kotlin, 중괄호 짝맞춤) 안을 공백으로 덮는다.
 *
 * Apple 5.1.3(ii)는 "디버그 경로가 없을 것"을 요구하지 않는다 — **릴리스 빌드에서 컴파일 아웃될
 * 것**을 요구한다. 그래서 가드는 토큰의 부재가 아니라 *이 함수를 통과한 뒤의* 부재를 단언한다.
 */
export function releaseOnlyText(text: string, flavor: NativeFlavor): string {
  const code = stripNativeComments(text);
  const out = code.split('');
  const blank = (start: number, end: number): void => {
    for (let i = start; i < end; i += 1) {
      if (out[i] !== '\n' && out[i] !== '\r') out[i] = ' ';
    }
  };

  if (flavor === 'swift') {
    // `#if DEBUG` … (`#else` …) … `#endif`. 중첩된 `#if`도 센다.
    const directive = /#(if|endif)\b[^\n]*/gu;
    let match: RegExpExecArray | null;
    let start = -1;
    let depth = 0;
    while ((match = directive.exec(code)) !== null) {
      const isIf = match[1] === 'if';
      if (isIf) {
        if (depth === 0 && /#if\s+DEBUG\b/u.test(match[0])) start = match.index;
        if (start >= 0) depth += 1;
      } else if (start >= 0) {
        depth -= 1;
        if (depth === 0) {
          blank(start, match.index + match[0].length);
          start = -1;
        }
      }
    }
    return out.join('');
  }

  const marker = /BuildConfig\.DEBUG/gu;
  let match: RegExpExecArray | null;
  while ((match = marker.exec(code)) !== null) {
    const open = code.indexOf('{', match.index);
    if (open < 0) continue;
    let depth = 0;
    let j = open;
    for (; j < code.length; j += 1) {
      if (code[j] === '{') depth += 1;
      else if (code[j] === '}') {
        depth -= 1;
        if (depth === 0) {
          j += 1;
          break;
        }
      }
    }
    blank(match.index, j);
  }
  return out.join('');
}

export interface NativeHit {
  readonly file: string;
  readonly line: number;
  readonly token: string;
}

/** 주석을 제외한 코드에서 토큰이 등장하는 모든 지점. */
export function findTokens(
  file: string,
  text: string,
  tokens: readonly string[],
  transform: (text: string) => string = stripNativeComments,
): readonly NativeHit[] {
  const code = transform(text);
  const hits: NativeHit[] = [];
  for (const token of tokens) {
    let index = code.indexOf(token);
    while (index >= 0) {
      hits.push({ file, line: code.slice(0, index).split('\n').length, token });
      index = code.indexOf(token, index + token.length);
    }
  }
  return hits;
}

/** `(파일, 텍스트)` 쌍 — 가드가 반복해서 쓰는 형태. */
export function loadAll(paths: readonly string[]): readonly { path: string; text: string }[] {
  return paths.map((path) => ({ path, text: read(path) }));
}
