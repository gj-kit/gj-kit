# @gj-kit/toss-payments-nestjs

[`@gj-kit/toss-payments`](../toss-payments/README.md)의 `createTossPayments` 파사드를 NestJS DI에 얹는 통합 패키지입니다 — DI 토큰(`TOSS_PAYMENTS`), `TossPaymentsModule.forRoot/forRootAsync`, 타입 보존 별칭(`TossPaymentsFor`), rawBody 강제 웹훅 헬퍼(`toNestWebhookHandler`)를 제공합니다.

> **원칙 경계**: 코어의 "런타임 의존성 0" 원칙은 이 패키지에 적용되지 않습니다.
> Nest와 코어를 **peerDependencies로만** 수용하며(앱과 단일 인스턴스 공유 — 이중 로드 방지), `dependencies` 0은 유지합니다.

---

## ⚠️ 웹훅을 쓴다면 rawBody부터 — 3중 확인 (필독)

Nest 기본 body-parser가 웹훅 body를 JSON으로 **선파싱하면 서명/secret 검증이 전멸**합니다. 파싱된 객체를 다시 직렬화해도 원문과 바이트가 달라 검증은 복구되지 않습니다.

1. **Express 플랫폼(기본)** — 부트스트랩에서 rawBody 보존을 켜세요.

   ```ts
   const app = await NestFactory.create<NestExpressApplication>(AppModule, { rawBody: true });
   ```

   컨트롤러에서는 `@Req() req: RawBodyRequest<Request>`로 받아 `req.rawBody`를 사용합니다 — 직접 `verifier.verify(req.rawBody!, req.headers, { sourceIp: req.ip })`를 호출하거나, 아래의 `toNestWebhookHandler`에 위임하세요.

2. **Fastify 플랫폼** — `NestFactory.create(..., { rawBody: true })` 설정 후 동일하게 `req.rawBody`를 사용하세요(어댑터가 rawBody를 보존하도록 구성해야 합니다).

3. **경고** — 웹훅 경로에 별도 JSON body 미들웨어(`express.json()`, 전역 body-parser 재장착 등)가 선적용되면 rawBody가 있어도 검증 대상 원문이 오염될 수 있습니다. 웹훅 라우트에는 JSON 파싱 미들웨어를 두지 마세요.

`toNestWebhookHandler`는 `req.rawBody` 부재 시 **핸들러를 실행하지 않고 명시적 500 + 설정 안내 로그**를 남깁니다 — "400이 계속 나는데 원인을 모르는" 조용한 검증 전멸 사고를 설정 결함 신호로 바꿔 줍니다.

---

## 설치

```sh
pnpm add @gj-kit/toss-payments @gj-kit/toss-payments-nestjs
# peer: @nestjs/common ^10 || ^11, reflect-metadata, rxjs (Nest 앱이면 이미 있음)
```

- `emitDecoratorMetadata`가 **필요 없습니다.** 모든 주입이 명시적 `@Inject(토큰)`이라 SWC/esbuild(Vitest·tsup 포함) 빌드에서 무설정으로 동작합니다.

## forRoot — 동기 조립

config는 코어와 동일합니다(`createTossPayments` 인자 그대로). 기본 `global: true` — 앱 어디서든 import 없이 주입됩니다.

```ts
import { Module } from '@nestjs/common';
import { orThrow } from '@gj-kit/toss-payments';
import { defineTossPaymentsConfig, parseApiSecretKey } from '@gj-kit/toss-payments/server';
import { TossPaymentsModule, TossPaymentsFor } from '@gj-kit/toss-payments-nestjs';

export const tossConfig = defineTossPaymentsConfig({
  secretKey: orThrow(parseApiSecretKey(process.env.TOSS_SECRET_KEY!)),
  orders: {
    saveOrder: async (o) => { /* db 저장 */ },
    loadOrder: async (id) => null /* db 조회 */,
  },
});
export type AppToss = TossPaymentsFor<typeof tossConfig>;

@Module({
  imports: [TossPaymentsModule.forRoot(tossConfig)],
})
export class AppModule {}
```

## forRootAsync — 스토어를 Nest 프로바이더로 주입

DB 클라이언트(PrismaService 등)를 스토어 구현으로 쓰는 표준 경로입니다. 스토어를 프로바이더로 만들고 `inject`로 팩토리에 흘립니다.

```ts
import { Injectable, Module } from '@nestjs/common';
import type { OrderStore } from '@gj-kit/toss-payments/server';
import { defineTossPaymentsConfig, parseApiSecretKey } from '@gj-kit/toss-payments/server';
import { orThrow } from '@gj-kit/toss-payments';
import { TossPaymentsModule } from '@gj-kit/toss-payments-nestjs';

@Injectable()
export class TossOrderStore implements OrderStore {
  constructor(private readonly prisma: PrismaService) {}
  async saveOrder(order) { await this.prisma.tossOrder.create({ data: order }); }
  async loadOrder(orderId) { return this.prisma.tossOrder.findUnique({ where: { orderId } }); }
}

@Module({ providers: [TossOrderStore], exports: [TossOrderStore], imports: [PrismaModule] })
export class TossStoresModule {}

@Module({
  imports: [
    TossPaymentsModule.forRootAsync({
      imports: [TossStoresModule],
      inject: [TossOrderStore],
      // ⚠ 반환은 반드시 defineTossPaymentsConfig로 감싸세요 — 팩토리 반환 경로에서는
      //   const 추론이 풀려 배선 판정(조건부 프로퍼티)이 무너질 수 있습니다.
      useFactory: (orders: TossOrderStore) =>
        defineTossPaymentsConfig({
          secretKey: orThrow(parseApiSecretKey(process.env.TOSS_SECRET_KEY!)),
          orders,
        }),
    }),
  ],
})
export class AppModule {}
```

## 타입 보존 패턴 — 배선 누락을 주입부에서도 컴파일 에러로

`forRootAsync`는 런타임 토큰 주입이라 kit의 조건부 타입이 그냥은 소실됩니다. config를 `defineTossPaymentsConfig`로 한 번 고정하고 `TossPaymentsFor<typeof config>`를 앱 전역 별칭으로 쓰세요.

```ts
// app/toss.config.ts
export const tossConfig = defineTossPaymentsConfig({ secretKey, orders, billingKeys });
export type AppToss = TossPaymentsFor<typeof tossConfig>;

// 주입부 — 빠진 스토어의 플로우 접근은 여기서도 컴파일 에러
@Injectable()
export class SubscriptionService {
  constructor(@InjectTossPayments() private readonly toss: AppToss) {}
  charge() { return this.toss.billing.approve(/* ... */); }   // billingKeys 배선 시에만 컴파일
}
```

에러↔원인 매핑(코어 §2와 동일): `Property 'billing' does not exist ...` → config에 `billingKeys` 미배선(또는 위젯 키 파사드), `'confirm'` 부재 → `orders` 미배선, `'webhook'` 부재 → `webhook: { dedupe }` 미배선.

## 웹훅 컨트롤러

```ts
import { Controller, Post, Req, Res } from '@nestjs/common';
import type { RawBodyRequest } from '@nestjs/common';
import type { Request, Response } from 'express';
import { InjectTossPayments, toNestWebhookHandler } from '@gj-kit/toss-payments-nestjs';
import type { AppToss } from '../toss.config';

@Controller('webhooks')
export class TossWebhookController {
  private readonly handle;

  constructor(@InjectTossPayments() toss: AppToss) {
    this.handle = toNestWebhookHandler(toss.webhook, {
      onDepositCallback: async (w) => { /* 가상계좌 입금 반영 */ },
      onPaymentStatusChanged: async (w) => {
        if (w.prefetched?.ok) { /* payload가 아닌 조회 결과로 갱신 */ }
      },
    });
  }

  @Post('toss')
  async toss(@Req() req: RawBodyRequest<Request>, @Res() res: Response) {
    await this.handle(req, res); // 검증→dedupe→200 ack→디스패치 전부 코어에 위임
  }
}
```

`verifier.verify`를 직접 쓰는 수동 경로도 그대로 가능합니다(응답 소유권을 직접 가질 때):

```ts
@Post('toss')
async toss(@Req() req: RawBodyRequest<Request>, @Res() res: Response) {
  const verdict = await this.toss.webhook.verify(req.rawBody!, req.headers, { sourceIp: req.ip });
  // ... 10초 안에 200을 먼저 확정하고 처리하세요
}
```

## 공개 표면

| export | 설명 |
|---|---|
| `TOSS_PAYMENTS` | kit 바인딩 토큰 — `Symbol.for` 기반(ESM/CJS 이중 로드에도 동일) |
| `InjectTossPayments()` | `@Inject(TOSS_PAYMENTS)` 명시 위임 데코레이터 |
| `TossPaymentsModule.forRoot(config, { global? })` | 동기 조립 (기본 global: true) |
| `TossPaymentsModule.forRootAsync({ imports?, inject?, useFactory, global? })` | DI 의존 조립 |
| `TossPaymentsFor<C>` | config 타입 → kit 타입 복원 별칭 (§4.3) |
| `toNestWebhookHandler(verifier, handlers)` | rawBody 강제 웹훅 핸들러 (부재 시 명시적 500) |

코어 사용법(플로우·옵션·에러 표)은 [`@gj-kit/toss-payments` README](../toss-payments/README.md)를 보세요.
