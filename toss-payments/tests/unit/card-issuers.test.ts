import { describe, expect, it } from 'vitest';

import { CARD_ISSUER_NAMES_KO, cardIssuerName } from '../../src/index';

describe('CARD_ISSUER_NAMES_KO — 공식 기관 코드 표(문서 ID 118) 전사', () => {
  it('국내 24 + 해외 6 = 30개 코드, 동결 객체', () => {
    expect(Object.keys(CARD_ISSUER_NAMES_KO)).toHaveLength(30);
    expect(Object.isFrozen(CARD_ISSUER_NAMES_KO)).toBe(true);
  });

  it('국내 표 — 두 자리 코드 → 카드사 열 (우리 계열은 매입사 괄호 제거)', () => {
    expect(CARD_ISSUER_NAMES_KO).toMatchObject({
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
    });
  });

  it('해외 표 — 다이너스/마스터/유니온페이/아멕스/JCB/VISA', () => {
    expect(CARD_ISSUER_NAMES_KO).toMatchObject({
      '6D': '다이너스 클럽',
      '4M': '마스터카드',
      '3C': '유니온페이',
      '7A': '아메리칸 익스프레스',
      '4J': 'JCB',
      '4V': 'VISA',
    });
  });

  it('모든 값은 비어 있지 않은 문자열이다', () => {
    for (const [code, name] of Object.entries(CARD_ISSUER_NAMES_KO)) {
      expect(typeof name, code).toBe('string');
      expect(name.length, code).toBeGreaterThan(0);
    }
  });
});

describe('cardIssuerName — 정확 일치 조회, 미등록은 undefined', () => {
  it('통합 테스트 표준 카드(issuerCode 21)는 하나카드', () => {
    expect(cardIssuerName('21')).toBe('하나카드');
    expect(cardIssuerName('21', 'ko')).toBe('하나카드');
  });

  it('응답 전용 코드 W1(우리카드)도 조회된다', () => {
    expect(cardIssuerName('W1')).toBe('우리카드');
  });

  it('미등록·정규화 없음 — 소문자/공백/빈 문자열은 undefined', () => {
    expect(cardIssuerName('')).toBeUndefined();
    expect(cardIssuerName('99')).toBeUndefined();
    expect(cardIssuerName('3a')).toBeUndefined();
    expect(cardIssuerName(' 21')).toBeUndefined();
  });

  it('프로토타입 키는 오탐하지 않는다', () => {
    expect(cardIssuerName('constructor')).toBeUndefined();
    expect(cardIssuerName('toString')).toBeUndefined();
    expect(cardIssuerName('__proto__')).toBeUndefined();
  });

  it('테이블과 함수가 같은 답을 낸다', () => {
    for (const [code, name] of Object.entries(CARD_ISSUER_NAMES_KO)) {
      expect(cardIssuerName(code), code).toBe(name);
    }
  });
});
