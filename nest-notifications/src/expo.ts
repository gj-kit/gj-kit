/**
 * `@gj-kit/nest-notifications/expo` — Expo 지식만, SDK 없이.
 *
 * 이 패키지의 가장 중요한 경계다. Expo를 쓰지 않는 소비자(FCM·APNs·웹푸시)는 이 청크를
 * 아예 로드하지 않고, 분리 자체가 검사 가능한 불변식을 만든다 — `src/core/**`에 이 provider의
 * 이름이 한 번도 등장하지 않는다(`tests/unit/guards/transport-free-core.test.ts`).
 *
 * 이 파일들은 `../core/*` 밖의 무엇도 import하지 않는다. `expo-server-sdk`는 dependency도
 * peer도 optional peer도 아니다(설계 §2.2).
 */
export { chunkExpoPushMessages } from './expo/chunk';
export { classifyExpoPushTickets } from './expo/tickets';
export type { ExpoTicketClassification } from './expo/tickets';
export { createExpoPushGateway, isExpoPushToken } from './expo/gateway';
export type { ExpoPushGatewayOptions } from './expo/gateway';
export { EXPO_DEVICE_NOT_REGISTERED, EXPO_PUSH_CHUNK_SIZE } from './expo/wire';
export type { ExpoPushEntry, ExpoPushMessage, ExpoPushTicket } from './expo/wire';
