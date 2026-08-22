/** 테스트 전용 불투명 protector — 저장 SQL에 평문이 닿지 않는지와 AAD context 전달을 검증한다. */
import type {
  SensitiveValueContext,
  SensitiveValueProtector,
} from '../../../src/sensitive-values';

export interface SensitiveValueProtectorCall {
  readonly operation: 'encrypt' | 'decrypt';
  readonly value: string;
  readonly context: SensitiveValueContext;
}

export interface SensitiveValueProtectorProbe {
  readonly protector: SensitiveValueProtector;
  readonly calls: SensitiveValueProtectorCall[];
  readonly ciphertextFor: (plaintext: string, context: SensitiveValueContext) => string | undefined;
}

/**
 * ciphertext는 평문과 무관한 순번이며, 메모리 map에만 원문을 둔다. decrypt는 context까지
 * 같은 경우에만 성공해 AAD binding을 실제 호출 경로에서 회귀 검증할 수 있다.
 */
export function createSensitiveValueProtectorProbe(): SensitiveValueProtectorProbe {
  const calls: SensitiveValueProtectorCall[] = [];
  const records = new Map<string, { readonly plaintext: string; readonly context: SensitiveValueContext }>();
  let sequence = 0;

  const protector: SensitiveValueProtector = {
    async encrypt(plaintext, context) {
      const ciphertext = `sealed-${++sequence}`;
      records.set(ciphertext, { plaintext, context: { ...context } });
      calls.push({ operation: 'encrypt', value: plaintext, context: { ...context } });
      return ciphertext;
    },
    async decrypt(ciphertext, context) {
      calls.push({ operation: 'decrypt', value: ciphertext, context: { ...context } });
      const record = records.get(ciphertext);
      if (
        record === undefined ||
        record.context.purpose !== context.purpose ||
        record.context.recordId !== context.recordId
      ) {
        throw new Error('test protector context mismatch');
      }
      return record.plaintext;
    },
  };

  return {
    protector,
    calls,
    ciphertextFor(plaintext, context) {
      for (const [ciphertext, record] of records) {
        if (
          record.plaintext === plaintext &&
          record.context.purpose === context.purpose &&
          record.context.recordId === context.recordId
        ) {
          return ciphertext;
        }
      }
      return undefined;
    },
  };
}
