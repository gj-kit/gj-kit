// 플러그인 props의 **런타임 검증**. 공개 타입 정본은 `src/plugin-types.ts`이고 이 파일은 그것의
// 구조적 사본이다(rootDir 경계 — `scopes.ts` 상단 참조). `plugin/__tests__/props-parity.test.ts`가
// 두 타입의 **상호 대입 가능성**을 컴파일 타임에 단언한다.

import { SCOPES, type Scope } from './scopes';

export interface GjKitWorkoutsPluginProps {
  /**
   * The scopes this app will ever ask for. Drives the iOS entitlement and every Android
   * `<uses-permission>` line. `'routes'` in either list additionally emits the manifest-only
   * READ_EXERCISE_ROUTES entry, which is MANDATORY: undeclared, route requests silently return
   * nothing with no error at all.
   *
   * ⚠ Since owner decision ② the vocabulary is SEVEN scopes and `'workouts'` means the session
   *   ALONE. `read: ['workouts']` in `app.json` now emits ONE `<uses-permission>` line instead of
   *   four, and the failure shows up at runtime as `undefined` totals — far from the file that
   *   caused it. For the old (coarse) behaviour write the four members out, or import
   *   `WORKOUT_TOTALS_SCOPES` from `@gj-kit/expo-workouts/core` in an `app.config.ts`.
   *   `./core` has zero peers, so importing it from a config file is safe.
   */
  readonly read?: readonly Scope[] | undefined;
  readonly write?: readonly Scope[] | undefined;
  /** D10. Adds READ_HEALTH_DATA_HISTORY. Default false — the 30-day wall is the default reality. */
  readonly history?: boolean | undefined;
  /**
   * REQUIRED. Android 14+ launches `VIEW_PERMISSION_USAGE` + category `HEALTH_PERMISSIONS` at the
   * app when the user taps "privacy policy" in the permission dialog, and the activity-alias this
   * plugin registers needs somewhere to go. A dead link there is a user-visible defect, and Play's
   * Health apps declaration requires a policy URL anyway — so this is not optional.
   */
  readonly privacyPolicyUrl: string;
  readonly ios?:
    | {
        /**
         * NSHealthShareUsageDescription. An English default is supplied; localise via
         * `ios.infoPlist`/locales.
         * ⚠ A missing usage string CRASHES at `requestAuthorization` — the plugin makes that
         *   unreachable.
         */
        readonly shareUsageDescription?: string | undefined;
        /** NSHealthUpdateUsageDescription. */
        readonly updateUsageDescription?: string | undefined;
      }
    | undefined;
}

/** 검증을 통과한 props — 이후 모든 mod가 보는 유일한 형태다. 배열은 정렬·중복 제거돼 있다. */
export interface ResolvedProps {
  readonly read: readonly Scope[];
  readonly write: readonly Scope[];
  readonly history: boolean;
  readonly privacyPolicyUrl: string;
  /** 소비자가 **명시적으로** 준 값만. 없으면 `undefined`이고, mod가 그때 기존 Info.plist 값 →
   *  기본값 순으로 채운다 (덮어쓰기 금지 규칙). */
  readonly shareUsageDescription: string | undefined;
  readonly updateUsageDescription: string | undefined;
}

/**
 * 기본 usage string. 영어 기본값이고, 소비자는 `ios.infoPlist`(또는 `expo-localization` locales)로
 * 현지화한다 — 플러그인은 이미 값이 있으면 **덮어쓰지 않는다**(`withGjKitWorkoutsIos` 참조).
 * `$(PRODUCT_NAME)`은 Xcode가 빌드 시점에 치환한다.
 */
export const DEFAULT_SHARE_USAGE_DESCRIPTION =
  'Allow $(PRODUCT_NAME) to read your workouts and routes from the Health app.';
export const DEFAULT_UPDATE_USAGE_DESCRIPTION =
  'Allow $(PRODUCT_NAME) to save the workouts and routes you record to the Health app.';

const PREFIX = '@gj-kit/expo-workouts config plugin: ';

/** `http(s)://…` 절대 URL만 허용한다. `new URL`을 쓰지 않는 이유 — `plugin/`은 lib에 DOM이 없다. */
const ABSOLUTE_HTTP_URL = /^https?:\/\/[^\s/$.?#][^\s]*$/i;

function assertScopeList(value: unknown, field: 'read' | 'write'): readonly Scope[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) {
    throw new Error(`${PREFIX}\`${field}\` must be an array of scopes, got ${JSON.stringify(value)}.`);
  }
  const known = new Set<string>(SCOPES);
  for (const entry of value as readonly unknown[]) {
    if (typeof entry !== 'string' || !known.has(entry)) {
      throw new Error(
        `${PREFIX}unknown scope ${JSON.stringify(entry)} in \`${field}\`. ` +
          `Valid scopes are: ${SCOPES.join(', ')}.`,
      );
    }
  }
  // SCOPES 순서로 정규화 — 방출 순서가 props 작성 순서에 따라 흔들리면 스냅샷이 무의미해진다.
  const wanted = new Set(value as readonly Scope[]);
  return SCOPES.filter((scope) => wanted.has(scope));
}

/**
 * props를 검증하고 정규화한다. **모든 실패는 prebuild 시점에 던진다** — 잘못된 매니페스트를
 * 조용히 방출하는 것보다 빌드가 멈추는 편이 항상 낫다.
 */
export function resolveProps(props: GjKitWorkoutsPluginProps | undefined): ResolvedProps {
  if (props === undefined || props === null || typeof props !== 'object') {
    throw new Error(
      `${PREFIX}the \`privacyPolicyUrl\` prop is required. ` +
        `Configure the plugin as ["@gj-kit/expo-workouts", { "privacyPolicyUrl": "https://example.com/privacy" }].`,
    );
  }
  const privacyPolicyUrl = props.privacyPolicyUrl;
  if (typeof privacyPolicyUrl !== 'string' || !ABSOLUTE_HTTP_URL.test(privacyPolicyUrl)) {
    throw new Error(
      `${PREFIX}\`privacyPolicyUrl\` must be an absolute http(s) URL, got ${JSON.stringify(privacyPolicyUrl)}. ` +
        `Android 14+ opens it from the health permission dialog, so a dead link is a user-visible defect.`,
    );
  }
  if (props.history !== undefined && typeof props.history !== 'boolean') {
    throw new Error(`${PREFIX}\`history\` must be a boolean, got ${JSON.stringify(props.history)}.`);
  }
  const ios = props.ios;
  if (ios !== undefined && (typeof ios !== 'object' || ios === null || Array.isArray(ios))) {
    throw new Error(`${PREFIX}\`ios\` must be an object, got ${JSON.stringify(ios)}.`);
  }
  for (const key of ['shareUsageDescription', 'updateUsageDescription'] as const) {
    const value = ios?.[key];
    if (value !== undefined && (typeof value !== 'string' || value.length === 0)) {
      throw new Error(`${PREFIX}\`ios.${key}\` must be a non-empty string when provided.`);
    }
  }

  return {
    read: assertScopeList(props.read, 'read'),
    write: assertScopeList(props.write, 'write'),
    history: props.history === true,
    privacyPolicyUrl,
    shareUsageDescription: ios?.shareUsageDescription,
    updateUsageDescription: ios?.updateUsageDescription,
  };
}
