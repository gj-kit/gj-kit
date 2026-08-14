# gj-kit — 모노레포 규칙

> 모든 구현 에이전트가 따를 라이브러리 설계·공개 API·artifact handoff 정본은 [AGENTS.md](AGENTS.md)다. 이 문서는 모노레포 운영 규칙을 보완한다.

## 구조

- **루트의 각 폴더 = 독립 npm 라이브러리** (`packages/` 하위 아님). 예: `toss-payments/` = `@gj-kit/toss-payments`.
- pnpm workspaces 사용 — `pnpm-workspace.yaml`의 `packages: ["*"]`. package.json이 있는 폴더만 워크스페이스 패키지로 인식된다.
- 패키지 간 공유 설정은 루트 `tsconfig.base.json`을 extends.
- 각 패키지는 TypeScript strict, ESM+CJS 듀얼(tsup), 런타임 의존성 0을 유지한다.

## 시크릿

- **`.env` 절대 커밋 금지.** `.gitignore`가 `.env`, `.env.*`를 무시하는지 커밋 전 항상 확인.
- `.env` 내용을 로그·문서·코드에 출력하지 않는다. 공유용 형식은 `.env.example`만.

## 커밋 컨벤션

- Conventional Commits: `feat(toss-payments): ...`, `fix:`, `chore:`, `docs:`, `test:` 등.
- 제목은 영어 허용, **본문은 한국어**로 작성.

## 배포

- Changesets로 버전 관리: 변경 시 `pnpm changeset` → 버전 반영은 `pnpm changeset version`.
- **npm publish는 직접 실행하지 않는다.** 사용자가 npm 조직(@gj-kit) 생성 후 별도로 publish한다.

## 테스트 3계층

| 계층 | 파일 패턴 | 실행 | 비고 |
|---|---|---|---|
| unit | `tests/unit/**/*.test.ts` | `pnpm test` | 네트워크 없음 |
| type | `tests/types/**/*.test-d.ts` | `pnpm test:types` | vitest typecheck + expectTypeOf + `@ts-expect-error` 픽스처 |
| integration | `tests/integration/**/*.integration.test.ts` | `pnpm --filter <pkg> test:integration` | **루트 `.env` 필요** · 직렬 실행(fileParallelism false) · 토스 테스트 환경 **분당 100건 제한** 주의 |

## 빌드/검증 명령

```sh
pnpm install          # 의존성 설치
pnpm build            # 전 패키지 빌드 (tsup)
pnpm typecheck        # 전 패키지 tsc --noEmit
pnpm test             # 전 패키지 unit 테스트
pnpm test:types       # 전 패키지 타입 테스트
pnpm --filter @gj-kit/toss-payments test:integration   # 통합 테스트 (.env 필요)
pnpm --filter @gj-kit/toss-payments test:all           # unit → types → integration 순차
```
