/**
 * 카드사 두 자리 코드 → 한글 표시명 — 공식 "기관 코드" 표(docs.tosspayments.com/codes/org-codes,
 * 문서 ID 118, "카드사 코드" 국내·해외) 전사. 응답 `card.issuerCode` / `card.acquirerCode`는
 * 항상 이 두 자리 코드다(한글·영문 코드는 요청 전용).
 *
 * 표시명은 문서의 "카드사" 열 그대로이되, 우리 계열 두 행의 매입사 괄호("(BC 매입)"/
 * "(우리 매입)")만 뗐다 — 화면 표기용이기 때문. 뜻은 문서 참고 문구와 같다:
 * `33` 우리BC카드는 BC 매입, `W1` 우리카드는 우리 매입(응답 전용 코드).
 */

/**
 * Card issuer/acquirer codes that Toss documents on its "기관 코드" page (`/codes/org-codes`,
 * "카드사 코드" — domestic and overseas). Responses (`card.issuerCode`, `card.acquirerCode`)
 * always carry one of these two-character codes; the Korean/English aliases are request-only.
 *
 * This union is a documentation aid for exhaustive tables; {@link cardIssuerName} accepts any
 * string so a code Toss adds later degrades to `undefined`, not to a compile error.
 */
export type KnownCardIssuerCode =
  | '3K' // 기업 BC
  | '46' // 광주은행
  | '71' // 롯데카드
  | '30' // 한국산업은행
  | '31' // BC카드
  | '51' // 삼성카드
  | '38' // 새마을금고
  | '41' // 신한카드
  | '62' // 신협
  | '36' // 씨티카드
  | '33' // 우리BC카드 (BC 매입)
  | 'W1' // 우리카드 (우리 매입) — 응답 전용
  | '37' // 우체국예금보험
  | '39' // 저축은행중앙회
  | '35' // 전북은행
  | '42' // 제주은행
  | '15' // 카카오뱅크
  | '3A' // 케이뱅크
  | '24' // 토스뱅크
  | '21' // 하나카드
  | '61' // 현대카드
  | '11' // KB국민카드
  | '91' // NH농협카드
  | '34' // Sh수협은행
  | '6D' // 다이너스 클럽
  | '4M' // 마스터카드
  | '3C' // 유니온페이
  | '7A' // 아메리칸 익스프레스
  | '4J' // JCB
  | '4V'; // VISA

/**
 * Korean display names for every code in {@link KnownCardIssuerCode}, keyed by the two-character
 * code Toss returns in `card.issuerCode` / `card.acquirerCode`.
 *
 * Names are the "카드사" column of the official table verbatim, except that the acquirer
 * qualifiers on the two 우리 rows are dropped for display: `33` → `우리BC카드` (acquired by BC),
 * `W1` → `우리카드` (acquired by 우리; response-only code). The object is frozen; treat it as a
 * lookup table, not as product copy — override names in your own layer if your UI needs shorter
 * labels.
 */
export const CARD_ISSUER_NAMES_KO: Readonly<Record<KnownCardIssuerCode, string>> = Object.freeze({
  '3K': '기업 BC',
  '46': '광주은행',
  '71': '롯데카드',
  '30': '한국산업은행',
  '31': 'BC카드',
  '51': '삼성카드',
  '38': '새마을금고',
  '41': '신한카드',
  '62': '신협',
  '36': '씨티카드',
  '33': '우리BC카드',
  W1: '우리카드',
  '37': '우체국예금보험',
  '39': '저축은행중앙회',
  '35': '전북은행',
  '42': '제주은행',
  '15': '카카오뱅크',
  '3A': '케이뱅크',
  '24': '토스뱅크',
  '21': '하나카드',
  '61': '현대카드',
  '11': 'KB국민카드',
  '91': 'NH농협카드',
  '34': 'Sh수협은행',
  '6D': '다이너스 클럽',
  '4M': '마스터카드',
  '3C': '유니온페이',
  '7A': '아메리칸 익스프레스',
  '4J': 'JCB',
  '4V': 'VISA',
});

/**
 * Display name for a Toss card issuer/acquirer code, or `undefined` when the code is not in the
 * documented table (Toss may add institutions; render a neutral fallback such as "카드" yourself).
 *
 * Matching is exact — Toss returns codes exactly as listed (uppercase letter, no whitespace), so
 * no normalisation is applied. Only `'ko'` is supported today; the `locale` parameter exists so
 * other languages can be added without changing the signature.
 */
export function cardIssuerName(code: string, locale: 'ko' = 'ko'): string | undefined {
  void locale;
  // 프로토타입 키('constructor' 등) 오탐 방지 — 자체 속성만 조회
  return Object.prototype.hasOwnProperty.call(CARD_ISSUER_NAMES_KO, code)
    ? CARD_ISSUER_NAMES_KO[code as KnownCardIssuerCode]
    : undefined;
}
