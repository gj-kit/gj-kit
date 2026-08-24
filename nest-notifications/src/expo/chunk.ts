/**
 * 요청 크기 청킹 — 라이브러리가 소유한다(설계 §0.3-④).
 *
 * 소스는 SDK의 `chunkPushNotifications` 결과를 `cursor += messages.length`로 원본 입력과
 * 재대응했다. 즉 "SDK가 입력 순서를 보존하고 연속 분할한다"는 **문서화되지 않은 불변식**에
 * ticket→endpoint 대응을 걸어 둔 것이고, 어긋나면 엉뚱한 기기가 비활성화된다. 청크가
 * 자기 endpoint를 동반해 다니면 그 대응이 가정이 아니라 자료구조가 된다.
 */
import { NotificationsError } from '../core/errors';
import type { ExpoPushEntry } from './wire';
import { EXPO_PUSH_CHUNK_SIZE } from './wire';

/**
 * Splits entries into request-sized chunks. Each chunk keeps its endpoints beside
 * its messages, so ticket attribution is a data-structure fact rather than an
 * assumption about a third-party chunker's ordering (design 0.3-4).
 */
export function chunkExpoPushMessages(
  entries: readonly ExpoPushEntry[],
  options?: { readonly chunkSize?: number | undefined },
): readonly (readonly ExpoPushEntry[])[] {
  const chunkSize = options?.chunkSize ?? EXPO_PUSH_CHUNK_SIZE;
  if (!Number.isInteger(chunkSize) || chunkSize < 1) {
    throw new NotificationsError(
      'ERR_NOTIFICATION_CONFIG_INVALID',
      'chunkSize must be a positive integer.',
    );
  }
  const chunks: ExpoPushEntry[][] = [];
  for (let index = 0; index < entries.length; index += chunkSize) {
    chunks.push(entries.slice(index, index + chunkSize));
  }
  return chunks;
}
