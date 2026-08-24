/**
 * Expo push의 wire shape 최소 부분집합 — SDK import 0 (설계 §3.5).
 *
 * 값어치 있는 부분(청킹·ticket 분류·undersized 가드)은 SDK **타입**이 아니라 wire shape에
 * 대한 순수 함수다. 그래서 이 파일은 `expo-server-sdk`를 참조하지 않고 형태만 적는다.
 */
import type { NotificationPushEndpoint } from '../core/push';

/** The subset of Expo's push message wire shape this library produces. */
export interface ExpoPushMessage {
  readonly to: string;
  readonly title?: string | undefined;
  readonly body: string;
  readonly sound?: 'default' | null | undefined;
  readonly priority?: 'default' | 'normal' | 'high' | undefined;
  readonly channelId?: string | undefined;
  readonly collapseId?: string | undefined;
  readonly data?: Record<string, unknown> | undefined;
}

/** The subset of Expo's ticket wire shape this library reads. */
export type ExpoPushTicket =
  | { readonly status: 'ok'; readonly id: string }
  | {
      readonly status: 'error';
      readonly message?: string | undefined;
      readonly details?: { readonly error?: string | undefined } | undefined;
    };

/** One endpoint bound to the message built for it. The binding is the point. */
export interface ExpoPushEntry {
  readonly endpoint: NotificationPushEndpoint;
  readonly message: ExpoPushMessage;
}

/** Expo accepts at most 100 messages per request. */
export const EXPO_PUSH_CHUNK_SIZE = 100;

/** The ticket error Expo returns for a token whose device unregistered. */
export const EXPO_DEVICE_NOT_REGISTERED = 'DeviceNotRegistered';
