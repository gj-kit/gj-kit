/**
 * 수신자 liveness 배리어의 불투명 키(설계 §3.4.3).
 *
 * `node:crypto`를 쓰고 순수 SHA-256을 번들하지 않는다. 이 패키지는 Node 전용이고
 * (`platform: 'node'`, `engines: node >= 20`), `node:` 내장은 dependency가 아니며,
 * 손으로 옮긴 암호 코드는 감사받지 않은 코드다. 형제 RN 대상 패키지가 순수 SHA-256을 싣는
 * 이유는 Hermes에 `node:crypto`가 없기 때문이고, 그 조건이 여기엔 없다.
 */
import { createHash } from 'node:crypto';

import { NotificationsError } from './errors';

/** U+0000. Written as an escape so the byte never appears literally in source. */
const SEPARATOR = '\u0000';

/**
 * Stable opaque key for the recipient liveness barrier. The digest is
 * byte-identical to `sha256(applicationKey + U+0000 + recipientRef)`, so a host
 * that already stores tombstones under the source's key needs no migration.
 *
 * Throws `ERR_NOTIFICATION_RECIPIENT_KEY_INPUT` when either input contains a
 * U+0000 code point: the separator is only injective while the inputs are free
 * of it, and a length-prefixed encoding would have changed the digest (design
 * 0.2-5).
 *
 * The caller is the host, not the pipeline: a
 * {@link ../core/lifecycle!NotificationRecipientLiveness} implementation uses it
 * as the tombstone row key, which lets the barrier outlive a purge without
 * retaining the raw recipient reference.
 */
export function notificationRecipientKey(applicationKey: string, recipientRef: string): string {
  if (applicationKey.includes(SEPARATOR) || recipientRef.includes(SEPARATOR)) {
    throw new NotificationsError(
      'ERR_NOTIFICATION_RECIPIENT_KEY_INPUT',
      'applicationKey and recipientRef must not contain U+0000.',
    );
  }
  return createHash('sha256').update(`${applicationKey}${SEPARATOR}${recipientRef}`, 'utf8').digest('hex');
}
