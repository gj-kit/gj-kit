// iOS mod — entitlement 1개 + Info.plist 키 2개. 그 이상은 **아무것도** 하지 않는다 (설계 §7.2).

import { withEntitlementsPlist, withInfoPlist, type ConfigPlugin } from 'expo/config-plugins';

import {
  DEFAULT_SHARE_USAGE_DESCRIPTION,
  DEFAULT_UPDATE_USAGE_DESCRIPTION,
  type ResolvedProps,
} from './props';

/** HealthKit을 켜는 유일한 entitlement. */
export const HEALTHKIT_ENTITLEMENT = 'com.apple.developer.healthkit';

/**
 * **절대 쓰지 않는** entitlement (설계 §7.2, idx f19). clinical records 전용이며, 켜면 Apple이
 * 별도 심사 근거를 요구한다. 이 상수는 방출용이 아니라 **테스트가 부재를 단언하기 위한** 이름이다.
 */
export const FORBIDDEN_HEALTHKIT_ACCESS_ENTITLEMENT = 'com.apple.developer.healthkit.access';

/**
 * **절대 넣지 않는** `UIRequiredDeviceCapabilities` 항목 (idx f19 정정). Expo prebuild는 이것을
 * 자동으로 추가하지 않으며, 넣으면 HealthKit 없는 기기(iPad 다수)에서 **설치조차 되지 않는다**.
 */
export const FORBIDDEN_DEVICE_CAPABILITY = 'healthkit';

export const SHARE_USAGE_KEY = 'NSHealthShareUsageDescription';
export const UPDATE_USAGE_KEY = 'NSHealthUpdateUsageDescription';

export const withGjKitWorkoutsIos: ConfigPlugin<ResolvedProps> = (config, props) => {
  config = withEntitlementsPlist(config, (cfg) => {
    // 멱등: 이미 true면 다시 true를 쓴다. `…healthkit.access`는 읽지도 쓰지도 않는다 — 소비자가
    // 스스로 넣었다면 그것은 소비자의 결정이고, 우리가 지울 권리는 없다.
    cfg.modResults[HEALTHKIT_ENTITLEMENT] = true;
    return cfg;
  });

  config = withInfoPlist(config, (cfg) => {
    // 우선순위: 명시 prop > 소비자가 `ios.infoPlist`에 이미 쓴 값 > 영어 기본값.
    // 현지화는 소비자가 `ios.infoPlist`/`InfoPlist.strings` locales로 한다 — 그 값을 우리가
    // 덮어쓰면 현지화가 조용히 되돌려진다.
    //
    // ⚠ 두 키를 **언제나** 쓴다. `write` scope가 비어 있어도 마찬가지다: 누락 시
    //   `requestAuthorization`이 크래시하고(idx f19), 그 크래시는 심사에서 처음 발견된다.
    cfg.modResults[SHARE_USAGE_KEY] =
      props.shareUsageDescription ??
      (typeof cfg.modResults[SHARE_USAGE_KEY] === 'string' ? cfg.modResults[SHARE_USAGE_KEY] : undefined) ??
      DEFAULT_SHARE_USAGE_DESCRIPTION;
    cfg.modResults[UPDATE_USAGE_KEY] =
      props.updateUsageDescription ??
      (typeof cfg.modResults[UPDATE_USAGE_KEY] === 'string' ? cfg.modResults[UPDATE_USAGE_KEY] : undefined) ??
      DEFAULT_UPDATE_USAGE_DESCRIPTION;
    return cfg;
  });

  return config;
};
