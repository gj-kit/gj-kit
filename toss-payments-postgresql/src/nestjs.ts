/**
 * 엔트리 "./nestjs" — NestJS 배선 전용 (설계 §7).
 *
 * `@nestjs/*`는 이 서브패스에서만 import한다(optional peer 격리, AGENTS.md §2) —
 * 루트 엔트리 "." 는 Nest 없이도 동작한다.
 */
export { InjectTossPaymentsPostgres, TOSS_PAYMENTS_POSTGRES } from './nestjs/inject';
export { TossPaymentsPostgresModule } from './nestjs/module';
export type {
  TossPaymentsPostgresModuleAsyncOptions,
  TossPaymentsPostgresModuleOptions,
} from './nestjs/module';
// 주입부 타이핑 편의 — 집합체 타입을 루트 엔트리 없이도 가져올 수 있게 재export
export type { TossPaymentsPostgres, TossPaymentsPostgresOptions } from './factory';
// Nest forRoot/forRootAsync 옵션에 필요한 보호기 타입도 루트 엔트리 없이 가져올 수 있게 재export
export type {
  PgSensitiveStoreOptions,
  SensitiveValueContext,
  SensitiveValueProtector,
  SensitiveValuePurpose,
} from './sensitive-values';
