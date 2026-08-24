/**
 * ticket 분류 — undersized 응답 가드 포함(설계 §3.5).
 *
 * 순수 함수로 공개하는 이유는 두 가지다. ① 호스트가 receipt 폴링을 직접 붙일 수 있도록
 * 성공 ticket의 id를 돌려준다(§0.3-② — Expo의 `DeviceNotRegistered` 상당수는 ticket이
 * 아니라 receipt로 온다). ② 길이 불일치를 "핸드오프 성공"으로 취급하지 않는다는 판단이
 * 테스트 가능한 형태로 남는다.
 */
import type { ExpoPushEntry, ExpoPushTicket } from './wire';
import { EXPO_DEVICE_NOT_REGISTERED } from './wire';

export interface ExpoTicketClassification {
  readonly accepted: boolean;
  readonly invalidEndpointIds: readonly string[];
  /** Ids of accepted tickets, for a host that polls Expo receipts (design 0.3-2). */
  readonly ticketIds: readonly string[];
  /** Error codes only. A ticket `message` can carry payload text and never appears here. */
  readonly otherErrors: readonly string[];
}

/**
 * Maps one chunk's tickets back onto its entries.
 *
 * A response whose length differs from the request is never treated as a
 * handoff: which messages landed is unknowable, and losing a notification is
 * worse than sending it twice (design 3.1 F7). The tickets that did arrive are
 * still classified, so an endpoint the provider already confirmed as gone is
 * reported even in that case.
 */
export function classifyExpoPushTickets(
  entries: readonly ExpoPushEntry[],
  tickets: readonly ExpoPushTicket[],
): ExpoTicketClassification {
  const invalidEndpointIds: string[] = [];
  const ticketIds: string[] = [];
  const otherErrors: string[] = [];

  const paired = Math.min(entries.length, tickets.length);
  for (let index = 0; index < paired; index += 1) {
    const ticket = tickets[index];
    const entry = entries[index];
    if (ticket === undefined || entry === undefined) continue;
    if (ticket.status === 'ok') {
      ticketIds.push(ticket.id);
      continue;
    }
    const code = ticket.details?.error;
    if (code === EXPO_DEVICE_NOT_REGISTERED) {
      invalidEndpointIds.push(entry.endpoint.id);
      continue;
    }
    otherErrors.push(code ?? 'unknown');
  }

  const lengthsMatch = entries.length === tickets.length;
  return {
    accepted: lengthsMatch && otherErrors.length === 0,
    invalidEndpointIds,
    ticketIds,
    otherErrors,
  };
}
