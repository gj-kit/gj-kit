# gj-kit Agent Guide / 재사용 라이브러리 개발 가이드

`gj-kit`은 여러 Expo/React Native·TypeScript 프로젝트가 소비하는 독립 npm package 모노레포다. 이 문서는 라이브러리 코드를 추가·수정하는 모든 에이전트의 기본 규칙이다. 저장소 구조·시크릿·일반 명령은 [CLAUDE.md](CLAUDE.md)를 함께 따른다.

## 1. 패키지 책임을 먼저 정한다

공개 API는 특정 앱의 편의를 위한 코드가 아니라, 두 번째 소비자도 이해할 수 있는 안정적인 기술 계약이어야 한다.

- `expo-ui`: tokenized UI primitive, accessibility, theme, overlay, layout/safe-area helper.
- `expo-media`: media data contract, picker, metadata, durable file, save, Expo/native adapter.
- 앱 화면, DB·API·store, route, analytics, sync/outbox, 제품 copy·brand·도메인 type은 소비 앱에 남긴다. `@/`, `@shared`, 소비 앱 package를 import하지 않는다.
- 새 관심사가 UI/미디어 중 어디에도 자연스럽게 속하지 않으면 관련 없는 package를 비대하게 만들지 말고 focused package를 제안한다.

아직 제품 동작이 불안정하거나 한 제품의 정책일 뿐이면 억지로 추상화하지 않는다. 반대로 플랫폼 경계나 접근성·파일 수명주기처럼 일반적인 hardening은 소비 앱에 복제하지 않고 라이브러리 계약으로 올린다.

## 2. 공개 API·호환성·의존성

`package.json.exports`, 문서화된 subpath, exported type, error code, default behavior, permission 의미, peer requirement는 public contract다. export되지 않은 소스는 internal이며 소비자가 deep import할 수 없게 유지한다.

- 우선 additive API와 deprecated migration path를 선택한다. export 제거·rename, type 축소, default/error/permission 의미 변경, 새 required peer는 breaking change다.
- `0.x` breaking change는 minor, `1.0` 이후 breaking change는 major다. 계약을 보존하는 fix만 patch로 낸다.
- 새·변경된 public contract에는 unit test와 type test를 추가한다. closed union, required key, controlled state, serialization은 source compatibility도 검증한다.
- native exception, private URI, 소비자 데이터를 raw public error에 노출하지 않는다. 안정적인 typed error code와 type guard를 제공한다.
- direct runtime dependency 0이 기본이다. 추가 dependency는 불가피한 이유·peer/번들 영향·검증 범위를 문서화한 뒤에만 허용한다.

### Optional peer 및 플랫폼 분리

- 순수 core와 Expo/native adapter를 분리한다. optional peer는 필요한 explicit subpath와 platform build에서만 import한다.
- root import에 optional peer를 넣은 뒤 `try/catch`, dynamic import, `peerDependenciesMeta`로 Metro 문제를 숨기지 않는다. subpath export, 문서, native/web/SSR resolution test를 함께 추가한다.
- `expo-ui`의 React Native Web/safe-area 경계와 `expo-media`의 Expo 기능별 subpath 경계를 지킨다. peer 또는 Expo SDK support range를 넓히기 전에 packed consumer로 검증한다.

## 3. 구현부터 release artifact까지

변경은 source, test, README, changeset을 함께 완결한다.

1. contract와 compatibility 영향을 먼저 적고 구현한다.
2. public package 변경이면 changeset을 추가한다. API 동작, migration, peer/Expo 지원 범위, 사용자에게 보이는 fix를 설명한다.
3. build, typecheck, unit/type tests, README, export·peer checks를 실행한다.
4. version을 확정한 clean checkout에서 release gate와 pack을 실행한다. `prepack` provenance 검증을 우회하지 않는다.

```sh
corepack pnpm changeset
# 승인된 version 작업에서만
corepack pnpm version:packages
corepack pnpm run verify:release
```

`verify:release`의 packed consumer smoke, package-owned `dist/gj-kit-provenance.json`, package/export check는 release contract의 일부다. tarball이 생성됐다고 source 또는 provenance 검증을 생략하지 않는다.

사용자의 명시적 권한 없이 `npm publish`, `publish:npm`, `release:npm`, push를 실행하지 않는다. CI/maintainer release 정책과 충돌할 때는 직접 배포하지 말고 보고한다.

## 3-1. 제품 문구는 catalog가 정본

README와 문서 포털은 **생성물이다. 직접 편집하지 않는다.** 정본은 `website/src/data/catalog.mjs` 하나이고, `scripts/localize-readmes.mjs`(README 20종)와 `website/scripts/generate-api.mjs`(포털)가 여기서 렌더한다.

패키지마다 다음 필드를 채운다.

| 필드 | 무엇을 적는가 |
| --- | --- |
| `tagline` | 한 줄 payoff. 분류가 아니라 "무엇을 불가능하게 만드는가". 모든 화면의 lead |
| `problem` | 이 패키지 없이 실제로 나는 사고. 추상 명사 말고 구체적 실패 양상 |
| `highlights` | 그 사고를 막는 방법 4~5개. 각 항목은 실제 export한 심볼이나 파일로 추적 가능해야 한다 |
| `proof` | 측정한 숫자만. 테스트 수는 내림한 floor(`850+`), `@ts-expect-error` 수는 정확값 |
| `showcase` | 배선 예제 다음에 오는 두 번째 코드 블록. payoff가 드러나는 호출 |

규칙:

- **검증되지 않은 주장을 쓰지 않는다.** 성능·인기·타 라이브러리 비교는 금지다. 이 라이브러리군의 강점은 "위험한 실수가 컴파일 에러"이고, 그건 코드로 증명된다.
- `showcase`와 `code`는 `pnpm check:readme`가 dist 타입에 대해 실제로 컴파일한다. 컴파일되지 않는 예제는 넣지 않는다. 예외는 `toss-payments-nestjs` 하나로, 이 패키지의 `check-readme.mjs`는 코드 블록을 컴파일하지 않고 운영 표식만 확인한다(앱 소유 Nest 타입을 하네스에 복제하면 검사가 `any`로 무너지기 때문이다). 그래서 이 패키지의 예제가 주장하는 타입 동작은 `tests/types/docs-golden-path.test-d.ts`에 `@ts-expect-error`로 직접 고정해야 하며, README의 "주장 대신 검증" 문장도 `localize-readmes.mjs`의 `MARKER_CHECKED_README`가 다른 문구로 바꿔 낸다.
- 숫자 중 `@ts-expect-error` 개수는 직접 적지 않는다. 문구에 `{{guards}}`(패키지별), `{{guardTotal}}`·`{{guardFixtureFiles}}`(전체)를 쓰면 `website/src/data/verification.mjs`가 픽스처를 세어 생성 시점에 채운다. 알 수 없는 토큰은 생성이 실패한다.
- 포털 페이지는 MDX다. 타입 표현(`Record<K, V>`)은 반드시 backtick 안에 넣는다. 밖에 있으면 `generate-api.mjs`가 문장을 인용하며 생성을 실패시킨다.
- `pnpm check:docs`와 `pnpm check:readme`가 tagline·problem·highlights·badge의 존재를 검사한다. 문구를 지우면 CI가 깨진다.

문구를 고쳤으면 `node scripts/localize-readmes.mjs`와 `pnpm --filter @gj-kit/docs run generate:api`를 실행해 생성물을 갱신하고 함께 커밋한다.

## 4. 소비 앱 handoff

소비 앱은 workspace link, symlink, edited `node_modules`가 아니라 versioned `.tgz`를 vendor로 고정해야 한다. 따라서 라이브러리 변경을 handoff할 때는 아래를 함께 전달한다.

- package name, exact version, full source commit
- `npm pack`으로 만든 immutable tarball
- tarball의 SHA-256과 package-owned provenance stamp
- 추가·변경된 peer와 Expo SDK support 범위
- 실행한 release gate와 소비 앱에서 다시 해야 할 native/device 검증

소비 앱은 tarball, adjacent provenance JSON, `file:vendor/...` manifest, lockfile을 함께 갱신하고 자체 vendor verifier를 통과시켜야 한다. published registry version이나 동일 번호의 오래된 artifact를 가정하지 않는다.

## 5. 완료 전 체크

- [ ] reusable boundary이며 소비 앱 코드·제품 정책을 import하지 않는다.
- [ ] public API, types, error behavior, peer impact를 검토했다.
- [ ] unit/type/export/peer/consumer test와 README를 추가 또는 갱신했다.
- [ ] changeset과 semver 영향이 맞다.
- [ ] clean source commit에서 `corepack pnpm run verify:release`를 실행했다.
- [ ] vendor handoff에 exact version, SHA-256, source commit, validation evidence를 포함했다.
