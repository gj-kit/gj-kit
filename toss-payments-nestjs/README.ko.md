# @gj-kit/toss-payments-nestjs

[English](./README.md) · **한국어**

<!-- gj-kit-localized-overview -->

[![npm](https://img.shields.io/npm/v/@gj-kit/toss-payments-nestjs?label=npm&style=flat-square&color=0a7ea4)](https://www.npmjs.com/package/@gj-kit/toss-payments-nestjs)
[![CI](https://img.shields.io/github/actions/workflow/status/gj-kit/gj-kit/ci.yml?branch=main&label=CI&style=flat-square&color=0a7ea4)](https://github.com/gj-kit/gj-kit/actions/workflows/ci.yml)
[![types included](https://img.shields.io/badge/types-included-0a7ea4?style=flat-square)](https://www.npmjs.com/package/@gj-kit/toss-payments-nestjs)
[![runtime dependencies: 0](https://img.shields.io/badge/runtime%20deps-0-0a7ea4?style=flat-square)](https://www.npmjs.com/package/@gj-kit/toss-payments-nestjs)
[![license](https://img.shields.io/npm/l/@gj-kit/toss-payments-nestjs?label=license&style=flat-square&color=0a7ea4)](https://github.com/gj-kit/gj-kit/blob/main/toss-payments-nestjs/LICENSE)

> **DI token은 타입을 싣고 다니지 않습니다. `TossPaymentsFor<typeof config>`가 그 타입을 되살려, 배선하지 않은 flow는 그대로 컴파일 에러로 남습니다.**

## 왜 필요한가

DI token은 타입을 싣고 다니지 않습니다. `forRoot()`가 돌려주는 건 `unique symbol`에 바인딩된 `DynamicModule`이라, 주입 지점에 적은 생성자 타입 표기가 유일한 근거로 남습니다 — `BillingKeyStore`를 배선한 적 없는 config인데도 `toss.billing`이 타입 검사를 통과하고, 런타임에는 그 프로퍼티가 `undefined`입니다. 여기에 webhook controller를 붙이면 Nest 기본 body parser가 요청을 이미 객체로 바꿔 놓은 뒤입니다. 다시 직렬화한 JSON으로는 서명 검증을 복구할 수 없습니다.

## 무엇으로 막는가

- **배선 안 한 flow는 프로퍼티가 없습니다** — `TossPaymentsFor<typeof config>`가 DI 경계 뒤에서도 조건부 kit 타입을 복원하므로, `BillingKeyStore` 배선 없이 `toss.billing`을 쓰면 컴파일 에러입니다.
- **rawBody 부재는 조용히 넘어가지 않습니다** — `req.rawBody`가 없으면 `toNestWebhookHandler`는 handler를 호출하지 않습니다. 500을 돌려주고 확인할 설정 세 가지를 로그로 남깁니다 — `NestFactory.create`의 `rawBody: true`, Fastify의 raw body 지원 설정, 그리고 webhook route 앞에 걸린 JSON 미들웨어.
- **source IP가 wrapper를 통과합니다** — handler가 원본 Node `socket`을 그대로 전달해 코어의 fail-closed IP 검증이 유지되고, proxy 헤더를 신뢰하려면 `sourceIp` extractor를 명시해야 합니다.
- **ESM·CJS 어디서든 같은 token** — `TOSS_PAYMENTS`와 `getTossPaymentsToken(name)`은 `Symbol.for` 기반이라, 패키지가 ESM/CJS로 이중 로드돼도 provider 바인딩이 하나로 유지됩니다.
- **emitDecoratorMetadata 없이 동작합니다** — `InjectTossPayments()`는 `@Inject(token)`에 위임하는 얇은 래퍼이고 `src/` 어디에도 `design:paramtypes`를 읽는 코드가 없습니다. 그래서 패키지는 `emitDecoratorMetadata: false`로 배포되며, 해당 메타데이터를 아예 만들지 못하는 vitest의 esbuild 변환에서도 Nest DI 테스트가 그대로 해석됩니다.

## Golden path

> **완료 상태:** typed payment kit을 주입하는 Nest provider 하나를 만듭니다.

### 1. 설치

```sh
pnpm add @gj-kit/toss-payments-nestjs
```

### 2. 앱이 소유할 경계를 정합니다

core payment config을 만들고 한 번만 등록하며, webhook route에서는 원본 request bytes를 보존합니다.

### 3. 최소 연결부터 시작합니다

먼저 아래 코드를 복사한 뒤, 위에서 언급한 앱 소유 값만 교체하세요.

```ts
import { orThrow } from '@gj-kit/toss-payments';
import { defineTossPaymentsConfig, parseApiSecretKey } from '@gj-kit/toss-payments/server';
import { TossPaymentsModule } from '@gj-kit/toss-payments-nestjs';

declare const apiSecretFromEnv: string; // Read this once from your server environment.

const config = defineTossPaymentsConfig({
  secretKey: orThrow(parseApiSecretKey(apiSecretFromEnv)),
});

export const payments = TossPaymentsModule.forRoot(config);
```

## 실제로는 이렇게 걸립니다

주석 처리한 줄은 실제 TS2339입니다. 이 config에는 `BillingKeyStore`가 배선되어 있지 않으므로, 타입을 싣지 않는 DI token을 거쳐 주입된 kit에도 `billing` 프로퍼티 자체가 존재하지 않습니다.

```ts
import { Injectable } from '@nestjs/common';
import { orThrow } from '@gj-kit/toss-payments';
import { defineTossPaymentsConfig, parseApiSecretKey, type OrderStore } from '@gj-kit/toss-payments/server';
import { InjectTossPayments, TossPaymentsModule, type TossPaymentsFor } from '@gj-kit/toss-payments-nestjs';

declare const SECRET: string; // the app owns this (process.env)
declare const orders: OrderStore; // the app owns this (its own DB adapter)

export const tossConfig = defineTossPaymentsConfig({ secretKey: orThrow(parseApiSecretKey(SECRET)), orders });
export type AppToss = TossPaymentsFor<typeof tossConfig>;
export const tossModule = TossPaymentsModule.forRoot(tossConfig);

@Injectable()
export class PaymentsService {
  constructor(@InjectTossPayments() private readonly toss: AppToss) {}

  order = () => this.toss.confirm.createOrder({ amount: 9_900, orderName: 'Pro' });
  // this.toss.billing — TS2339: the config wired no BillingKeyStore, so there is no property.
}
```

## 주장 대신 검증

- 런타임 의존성 0
- @ts-expect-error로 고정한 거부 9건
- Nest 10·11 실제 부팅 검증
- unit 테스트 20개, 그중 8개는 실제 Nest DI 부팅

이 페이지의 골든 패스와 예제가 주장하는 타입 동작은 `tests/types/docs-golden-path.test-d.ts`가 실제 공개 표면에 대해 고정하고, 필수 운영 표식은 릴리스마다 검사합니다. 열 개 패키지가 공유하는 게이트는 `pnpm verify:release` 하나입니다.

## 사용할 때

Nest 앱에서 core payment kit의 타입과 안전 경계를 의존성 주입까지 유지해야 할 때 사용합니다.

## 사용하지 않을 때

controller에서 결제 검증을 다시 구현하거나 웹훅 검증에 raw bytes가 필요한데 파싱된 JSON에 의존하지 마세요.

## 런타임과 peer 조건

| Peer | 지원 범위 |
| --- | --- |
| `@gj-kit/toss-payments` | `^0.2.0 || ^0.3.0 || ^0.4.0 || ^0.5.0 || ^0.6.0` |
| `@nestjs/common` | `^10 || ^11` |
| `reflect-metadata` | `^0.1.13 || ^0.2` |
| `rxjs` | `^7` |

## 공개 entry point

- `@gj-kit/toss-payments-nestjs`

## 안전 경계

검증되는 웹훅은 원본 request bytes를 보존하고, 모든 store 의존성을 host Nest module에 명시하세요.

## 문서

- [패키지 가이드](https://gj-kit.github.io/gj-kit/ko/packages/toss-payments-nestjs/)
- [전체 API 명세](https://gj-kit.github.io/gj-kit/ko/api/toss-payments-nestjs/)
- [기계 판독 API JSON](https://gj-kit.github.io/gj-kit/api/toss-payments-nestjs.json)

포털은 npm 최신 공개판 선언 파일 스냅샷을 기준으로 합니다. 문서화된 public entry point만 사용하고 internal source file을 deep import하지 마세요.

## 상세 가이드


[`@gj-kit/toss-payments`](../toss-payments/README.md)의 안전한 결제 파사드를 NestJS 의존성 주입에 연결합니다. 단일 kit 호환 API(`TOSS_PAYMENTS`, `forRoot/forRootAsync`)와 여러 키 쌍을 분리하는 named API(`getTossPaymentsToken`, `register/registerAsync`), 타입 보존 별칭(`TossPaymentsFor`), raw body를 강제하는 웹훅 헬퍼(`toNestWebhookHandler`)를 제공합니다.

처음 연동한다면 아래 **Nest 골든 패스**를 그대로 따라 하세요. 기존 DB provider를 `OrderStore`로 감싸 한 번만 배선하면, 주문 저장·금액 대조·승인에 필요한 `confirm` 플로우를 앱 전체에서 주입할 수 있습니다.

> **원칙 경계**: 코어의 “런타임 의존성 0” 원칙은 이 패키지에 적용되지 않습니다. Nest와 코어는 앱과 단일 인스턴스를 공유하는 peer dependency이며, 이 패키지는 runtime dependency를 추가하지 않습니다.

## 설치

```sh
pnpm add @gj-kit/toss-payments @gj-kit/toss-payments-nestjs
```

Nest 앱에는 보통 이미 `@nestjs/common`, `reflect-metadata`, `rxjs`가 있습니다. `emitDecoratorMetadata`는 필요하지 않습니다. 모든 주입은 명시적 토큰을 사용하므로 SWC·esbuild에서도 별도 설정 없이 동작합니다.

## Nest 골든 패스 — 영속 주문 저장소 + 비동기 조립

일반적인 Nest 앱에서는 `forRootAsync`가 기본 선택입니다. **중요한 Nest 규칙**은 하나입니다: `useFactory`가 주입받을 provider는 `TossPaymentsModule.forRootAsync({ imports })`의 `imports`에서 export되어야 합니다. 상위 `AppModule`의 `providers`에만 등록하면 DynamicModule의 factory에서는 보이지 않습니다.

### 1. DB provider를 `OrderStore`로 감싸 export

아래는 Prisma 예시입니다. `TossOrder`는 `orderId`(unique), `amount`, `orderName`, `createdAt` 컬럼을 가진 앱의 주문 테이블로 바꾸세요. 이 예제는 KRW 결제만 다룹니다.

```ts
// payments/toss/toss-stores.module.ts
import { Injectable, Module } from '@nestjs/common';
import type { OrderId } from '@gj-kit/toss-payments';
import type { OrderStore, StoredOrder } from '@gj-kit/toss-payments/server';
import { PrismaModule, PrismaService } from '../../prisma';

@Injectable()
export class TossOrderStore implements OrderStore {
  constructor(private readonly prisma: PrismaService) {}

  async saveOrder(order: StoredOrder): Promise<void> {
    await this.prisma.tossOrder.create({
      data: {
        orderId: order.orderId,
        amount: order.amount,
        orderName: order.orderName,
        createdAt: new Date(order.createdAt),
      },
    });
  }

  async loadOrder(orderId: OrderId): Promise<StoredOrder | null> {
    const order = await this.prisma.tossOrder.findUnique({ where: { orderId } });
    if (order === null) return null;

    return {
      // 조회에 사용한 branded orderId를 되돌려 타입 경계를 유지합니다.
      orderId,
      amount: order.amount,
      currency: 'KRW',
      orderName: order.orderName,
      createdAt: order.createdAt.toISOString(),
    };
  }
}

@Module({
  imports: [PrismaModule],
  providers: [TossOrderStore],
  exports: [TossOrderStore],
})
export class TossStoresModule {}
```

`OrderStore`는 단순 캐시가 아니라 **승인 시 금액을 대조하는 단일 진실 공급원**입니다. 운영 환경에서는 반드시 내구성 있는 DB를 사용하세요.

### 2. config와 앱 전역 타입을 한 파일에 고정

`buildTossConfig`를 factory와 타입 별칭이 함께 사용하면, `forRootAsync` 뒤에도 `confirm`처럼 실제로 배선한 플로우만 주입부에 남습니다.

```ts
// payments/toss/toss.config.ts
import { orThrow } from '@gj-kit/toss-payments';
import {
  defineTossPaymentsConfig,
  parseApiSecretKey,
  type OrderStore,
} from '@gj-kit/toss-payments/server';
import type { TossPaymentsFor } from '@gj-kit/toss-payments-nestjs';

export const buildTossConfig = (orders: OrderStore) =>
  defineTossPaymentsConfig({
    // 부팅 시 한 번만 파싱합니다. 요청 처리 중에는 orThrow를 쓰지 마세요.
    secretKey: orThrow(parseApiSecretKey(process.env.TOSS_SECRET_KEY!)),
    orders,
  });

export type AppToss = TossPaymentsFor<ReturnType<typeof buildTossConfig>>;
```

### 3. storage module을 DynamicModule에 import

```ts
// app.module.ts
import { Module } from '@nestjs/common';
import { TossPaymentsModule } from '@gj-kit/toss-payments-nestjs';
import { TossStoresModule, TossOrderStore } from './payments/toss/toss-stores.module';
import { buildTossConfig } from './payments/toss/toss.config';

@Module({
  imports: [
    TossPaymentsModule.forRootAsync({
      // factory provider가 보이는 모듈 스코프입니다.
      imports: [TossStoresModule],
      inject: [TossOrderStore],
      useFactory: (orders: TossOrderStore) => buildTossConfig(orders),
    }),
  ],
})
export class AppModule {}
```

기본값은 `global: true`입니다. 따라서 feature module에서 `TossPaymentsModule`을 다시 import하지 않아도 됩니다. 모듈 경계를 엄격히 유지하고 싶다면 `{ global: false }`를 지정하고 필요한 feature module에 직접 import하세요.

### 4. 서비스에서 주문을 만들고, 승인 플로우를 주입

클라이언트가 보낸 금액을 그대로 받지 말고, 서버가 보유한 상품·플랜 가격을 사용하세요. `toClientProps()`의 반환값은 브라우저 패키지의 `requestPayment` 입력에 바로 사용할 수 있습니다.

```ts
// payments/payments.service.ts
import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectTossPayments } from '@gj-kit/toss-payments-nestjs';
import type { AppToss } from './toss/toss.config';

const plans = {
  starter: { amount: 9_900, orderName: 'Starter 플랜' },
  pro: { amount: 19_900, orderName: 'Pro 플랜' },
} as const;

@Injectable()
export class PaymentsService {
  constructor(@InjectTossPayments() private readonly toss: AppToss) {}

  async createOrder(planId: keyof typeof plans) {
    const result = await this.toss.confirm.createOrder(plans[planId]);
    if (!result.ok) throw new BadRequestException(result.error);
    return result.value.toClientProps();
  }
}
```

successUrl의 콜백에서는 `parseSuccessCallback` → `toss.confirm.verify` → `toss.confirm.confirm` 순서를 따르세요. `verify`는 저장된 주문 금액과 콜백 금액을 대조한 뒤에만 승인용 값을 만듭니다. 전체 콜백·실패 복구 예제는 코어의 [결제위젯 승인 흐름](../toss-payments/README.md#4.1-결제위젯-주문-생성--인증--금액-검증--승인)을 참고하세요.

## 다른 조립 방식

### `forRoot` — config를 이미 동기로 만들 수 있을 때

Nest DI를 거치지 않는 저장소가 있다면 아래처럼 한 번에 조립할 수 있습니다.

```ts
import { Module } from '@nestjs/common';
import { TossPaymentsModule } from '@gj-kit/toss-payments-nestjs';
import { tossConfig } from './payments/toss.config';

@Module({
  imports: [TossPaymentsModule.forRoot(tossConfig)],
})
export class AppModule {}
```

`forRoot`와 `forRootAsync` 모두 `global` 옵션을 받을 수 있으며 기본값은 `true`입니다.

## 여러 Toss 키 쌍을 함께 쓴다면: named kit으로 분리

`TOSS_PAYMENTS`와 `forRoot/forRootAsync`는 기존 단일-kit 호환 API입니다. 결제위젯
`gsk`와 API/빌링 `sk`처럼 서로 다른 secret key를 함께 쓰면, 하나의 kit에 섞지 말고
이름 있는 kit을 각각 등록하세요. **이름은 한 Nest application 안에서 유일해야 하며**,
등록 이름과 `@InjectTossPayments(name)`은 정확히 같아야 합니다.

```ts
// payments/toss/toss.module.ts
import { Module } from '@nestjs/common';
import { TossPaymentsModule } from '@gj-kit/toss-payments-nestjs';
import { TossStoresModule, TossOrderStore } from './toss-stores.module';
import { buildBillingConfig, buildWidgetConfig } from './toss.config';

@Module({
  imports: [
    TossPaymentsModule.registerAsync({
      name: 'billing',
      imports: [TossStoresModule],
      inject: [TossOrderStore],
      useFactory: (orders: TossOrderStore) => buildBillingConfig(orders), // API sk
    }),
    TossPaymentsModule.registerAsync({
      name: 'widget',
      imports: [TossStoresModule],
      inject: [TossOrderStore],
      useFactory: (orders: TossOrderStore) => buildWidgetConfig(orders), // widget gsk
    }),
  ],
})
export class TossModule {}
```

```ts
import { Injectable } from '@nestjs/common';
import { InjectTossPayments } from '@gj-kit/toss-payments-nestjs';
import type { BillingToss, WidgetToss } from './toss.config';

@Injectable()
export class PaymentsService {
  constructor(
    @InjectTossPayments('billing') private readonly billing: BillingToss,
    @InjectTossPayments('widget') private readonly widget: WidgetToss,
  ) {}
}
```

`getTossPaymentsToken('billing')`은 테스트에서 named kit을 직접 조회할 때만 쓰고,
앱 서비스에서는 `@InjectTossPayments('billing')`을 사용하세요. 같은 이름을 두 번
등록하면 같은 Nest provider token을 가리키므로, 등록 이름을 상수로 모아 중복을 막는
것을 권장합니다.

## 웹훅을 추가한다면: rawBody부터

Nest의 기본 body parser가 웹훅 body를 먼저 JSON으로 파싱하면 서명·secret 검증은 복구할 수 없습니다. 파싱한 객체를 다시 직렬화해도 원문 바이트와 다릅니다.

1. Express 플랫폼에서는 부트스트랩에서 raw body를 보존하세요.

   ```ts
   const app = await NestFactory.create<NestExpressApplication>(AppModule, { rawBody: true });
   ```

2. 컨트롤러는 `@Req() req: RawBodyRequest<Request>`로 `req.rawBody`를 받고, `toNestWebhookHandler`에 요청과 응답을 위임하세요. 이 헬퍼는 Node request의 `socket.remoteAddress`를 코어에 그대로 전달하므로, 일반 상태 웹훅의 source-IP 검증도 유지됩니다.

   ```ts
   import { Controller, Post, Req, Res } from '@nestjs/common';
   import type { RawBodyRequest } from '@nestjs/common';
   import type { Request, Response } from 'express';
   import { InjectTossPayments, toNestWebhookHandler } from '@gj-kit/toss-payments-nestjs';
   import type { AppToss } from '../toss/toss.config';

   @Controller('webhooks')
   export class TossWebhookController {
     private readonly handle;

     constructor(@InjectTossPayments() toss: AppToss) {
       this.handle = toNestWebhookHandler(toss.webhook, {
         onDepositCallback: async (webhook) => {
           // trust: 'secret' — 입금 주문을 반영
         },
         onPaymentStatusChanged: async (webhook) => {
           if (webhook.prefetched?.ok) {
             // payload가 아니라 조회한 결제 상태를 반영
           }
         },
       });
     }

     @Post('toss')
     async toss(@Req() req: RawBodyRequest<Request>, @Res() res: Response) {
       await this.handle(req, res);
     }
   }
   ```

3. TLS 종료 프록시 뒤에서 원본 IP를 검증해야 한다면, 신뢰하는 ingress가 재작성한 헤더만 읽는 `sourceIp` extractor를 **명시적으로** 넘기세요. `X-Forwarded-For`를 기본적으로 신뢰하지 않습니다.

   ```ts
   import type { NodeIncomingMessageLike } from '@gj-kit/toss-payments/webhook';

   const sourceIpFromTrustedIngress = (request: NodeIncomingMessageLike) => {
     const value = request.headers['x-platform-client-ip'];
     // 이 헤더는 외부 요청에서 제거하고, 신뢰하는 ingress만 다시 설정해야 합니다.
     return typeof value === 'string' ? value : undefined;
   };

   this.handle = toNestWebhookHandler(toss.webhook, handlers, {
     sourceIp: sourceIpFromTrustedIngress,
   });
   ```

4. 웹훅 경로에 별도 `express.json()` 또는 전역 body parser를 다시 붙이지 마세요. `toNestWebhookHandler`는 raw body가 없으면 핸들러를 실행하지 않고, 500과 설정 안내 로그를 남깁니다.

Fastify도 `NestFactory.create(..., { rawBody: true })`로 raw body를 보존한 뒤 같은 방식으로 사용하세요.

## 공개 표면

| export | 설명 |
|---|---|
| `TOSS_PAYMENTS` | `Symbol.for` 기반 kit 바인딩 토큰 — ESM/CJS 이중 로드에도 동일 |
| `getTossPaymentsToken(name)` | named kit의 `Symbol.for` 토큰 — 이름은 Nest application 안에서 유일해야 함 |
| `InjectTossPayments()` / `InjectTossPayments(name)` | legacy/default 또는 named kit의 명시적 `@Inject` 위임 데코레이터 |
| `TossPaymentsModule.forRoot(config, { global? })` | 동기 조립 |
| `TossPaymentsModule.forRootAsync({ imports?, inject?, useFactory, global? })` | Nest provider 기반 비동기 조립 |
| `TossPaymentsModule.register({ name, config, global? })` | 이름 있는 동기 조립 — 여러 키 쌍 분리용 |
| `TossPaymentsModule.registerAsync({ name, imports?, inject?, useFactory, global? })` | 이름 있는 비동기 조립 — 여러 키 쌍 분리용 |
| `TossPaymentsFor<C>` | config 타입에서 kit 타입을 복원하는 별칭 |
| `toNestWebhookHandler(verifier, handlers, { sourceIp? })` | raw body·socket을 보존하는 Nest 웹훅 핸들러 |

플로우별 옵션·에러·브라우저 결제창 사용법은 [`@gj-kit/toss-payments` README](../toss-payments/README.md)를 참고하세요.

## 배포 산출물 handoff

이 패키지와 `@gj-kit/toss-payments`는 항상 같은 release handoff 단위입니다. source workspace
link나 수정된 `node_modules`를 전달하지 말고, 깨끗한 source commit에서 `corepack pnpm run
verify:release`를 실행한 뒤 두 `.tgz`를 소비 앱의 `vendor/`에 함께 고정하세요. release gate는
두 tarball의 package-owned `dist/gj-kit-provenance.json`과 SHA-256을 확인하고, fresh Nest 10·11
소비자에서 실제 DI application context와 ESM/CJS export를 검증합니다.

handoff에는 package별 정확한 version, 전체 `sourceCommit`, tarball SHA-256, provenance JSON을
기록하고 consumer의 `package.json`을 exact `file:vendor/...tgz` dependency로, lockfile까지 함께
갱신합니다. 소비 앱은 tarball과 인접 provenance JSON을 재검증해야 하며, 자신의 Nest major 및
rawBody/ingress·실제 provider callback 검증은 release gate와 별도로 수행해야 합니다. 자세한
명령과 manifest 예시는 코어 README의 [배포 산출물과 소비 앱 handoff](../toss-payments/README.md#배포-산출물과-소비-앱-handoff)를 참고하세요.
