// 금지 목록 정본 — 설계 문서 §5.3.
//
// 소스 가드(`source-guard.test.ts`)와 산출물 가드(`release-artifact.test.ts`)가 **같은
// 배열**을 읽는다. 설계 §5.4가 요구하는 것은 "소스와 산출물 양쪽이 닫힌다"인데, 목록을 두
// 벌 손으로 적으면 그 등식이 조용히 깨진다 — 실제로 초판의 산출물 스캔은 (a)에서 `notation`과
// `Intl.Locale`을, (b)에서 `style` 3종을, (d)에서 `require(`·`fetch(`를 빠뜨린 진부분집합이었다.
// 빌드 후처리가 `style: 'currency'`를 되돌려 넣어도 통과했다는 뜻이다.
//
// 주석은 스캔 전에 제거한다. 이 패키지의 설계 주석은 금지된 API를 **왜 안 쓰는지** 설명해야
// 하고(그 설명이 곧 계약이다), 그것이 가드에 걸리면 주석을 쓰지 못하게 되는 역효과가 난다.
// d.ts로 실려 나가는 JSDoc도 같은 이유로 같은 처리를 받는다.

/** (a) Hermes 미지원 Intl API·결함 옵션. */
export const FORBIDDEN_INTL: readonly string[] = [
  'formatToParts',
  'RelativeTimeFormat',
  'PluralRules',
  'ListFormat',
  'DisplayNames',
  'Segmenter',
  'DurationFormat',
  'Intl.Locale',
  'dateStyle',
  'timeStyle',
  'notation',
  'signDisplay',
  'compactDisplay',
  'dayPeriod',
  'fractionalSecondDigits',
  'numberingSystem',
  'toLocaleString',
  'toLocaleDateString',
  'toLocaleTimeString',
  'localeCompare',
];

/** (b) 로케일 데이터에 출력 형태를 위임하는 스타일. §0.6의 두 기각 결정이 코드로 돌아오는 것을 막는다. */
export const FORBIDDEN_STYLES: readonly RegExp[] = [
  /style\s*:\s*['"]currency['"]/,
  /style\s*:\s*['"]percent['"]/,
  /style\s*:\s*['"]unit['"]/,
  /\bcurrencyDisplay\b/,
];

/** (d) Node/DOM 전역 식별자. */
export const FORBIDDEN_GLOBALS: readonly string[] = [
  'process',
  'Buffer',
  '__dirname',
  'document',
  'window',
  'navigator',
  'localStorage',
  'setTimeout',
  'setInterval',
];

/** (d) 호출 형태로만 잡히는 것들 — 식별자 단독 등장은 무해하다. */
export const FORBIDDEN_CALLS = /\b(?:require|fetch)\s*\(/;

/**
 * 블록 주석 + **줄 전체가 주석인** 라인 주석을 제거한다.
 *
 * 줄 끝 주석을 지우지 않는 이유는 산출물 때문이다: 번들 안의 문자열 리터럴에 `//`가 들어
 * 있으면(`'https://…'`) 그 줄의 나머지 **코드**까지 잘려 나가고, 잘려 나간 자리에 위반이
 * 숨을 수 있다. 이 패키지의 `src/**`에는 줄 끝 주석이 하나도 없으므로(설명은 항상 자기 줄에
 * 적는다) 소스 쪽 손실도 0이다.
 */
export function stripComments(text: string): string {
  return text.replaceAll(/\/\*[\s\S]*?\*\//g, '').replaceAll(/^[ \t]*\/\/.*$/gm, '');
}

/** 하나의 텍스트에 대한 (a)(b)(d) 전수 검사 — 위반 심볼 목록을 돌려준다. */
export function forbiddenSymbolsIn(code: string): string[] {
  const found: string[] = [];
  for (const symbol of FORBIDDEN_INTL) {
    if (code.includes(symbol)) found.push(symbol);
  }
  for (const pattern of FORBIDDEN_STYLES) {
    if (pattern.test(code)) found.push(pattern.source);
  }
  for (const identifier of FORBIDDEN_GLOBALS) {
    if (new RegExp(`\\b${identifier}\\b`).test(code)) found.push(identifier);
  }
  if (FORBIDDEN_CALLS.test(code)) found.push(FORBIDDEN_CALLS.source);
  return found;
}
