// Phase 3에서 구현 — 키 4종(ApiClientKey/ApiSecretKey/WidgetClientKey/WidgetSecretKey)
// 템플릿 리터럴 + 브랜드 + EnvTag. 이 엔트리("."에서 도달)에서는 client key 파서만 export
// (secret key 파서는 server/keys.ts 전용 — 격리 규칙).
export type TODO_CoreKeys = never;
