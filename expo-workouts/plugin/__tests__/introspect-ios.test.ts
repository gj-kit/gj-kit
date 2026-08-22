// 설계 §7.3 마지막 행 + §7.2 — iOS introspect 스냅샷.
//
// 여기서 단언하는 **부재** 두 개(`…healthkit.access`, `UIRequiredDeviceCapabilities`의 `healthkit`)는
// 존재 단언보다 중요하다: 둘 다 "잘못 넣으면 심사·설치 단계에서야 터지는" 항목이고, 넣는 코드가
// 없다는 사실은 이 테스트 말고는 아무도 지켜주지 않는다.

import { describe, expect, it } from 'vitest';

import {
  FORBIDDEN_DEVICE_CAPABILITY,
  FORBIDDEN_HEALTHKIT_ACCESS_ENTITLEMENT,
  HEALTHKIT_ENTITLEMENT,
  SHARE_USAGE_KEY,
  UPDATE_USAGE_KEY,
} from '../src/withGjKitWorkoutsIos';
import {
  DEFAULT_SHARE_USAGE_DESCRIPTION,
  DEFAULT_UPDATE_USAGE_DESCRIPTION,
} from '../src/props';
import { SCOPES } from '../src/scopes';
import { introspectAsync } from './helpers';

const URL = 'https://example.com/privacy';

const COMBOS: { label: string; props: Parameters<typeof introspectAsync>[0] }[] = [
  { label: 'props 최소(기본)', props: { privacyPolicyUrl: URL } },
  { label: "read: ['workouts']", props: { privacyPolicyUrl: URL, read: ['workouts'] } },
  {
    label: '전수 read+write+history',
    props: { privacyPolicyUrl: URL, read: [...SCOPES], write: [...SCOPES], history: true },
  },
];

describe('entitlement', () => {
  for (const { label, props } of COMBOS) {
    it(`${label}: com.apple.developer.healthkit === true`, async () => {
      const { entitlements } = await introspectAsync(props);
      expect(entitlements[HEALTHKIT_ENTITLEMENT]).toBe(true);
    });

    it(`${label}: §7.2 — com.apple.developer.healthkit.access는 **쓰지 않는다** (clinical records 전용)`, async () => {
      const { entitlements } = await introspectAsync(props);
      expect(Object.keys(entitlements)).not.toContain(FORBIDDEN_HEALTHKIT_ACCESS_ENTITLEMENT);
    });
  }
});

describe('Info.plist usage strings — 누락 시 requestAuthorization이 **크래시**한다 (idx f19)', () => {
  for (const { label, props } of COMBOS) {
    it(`${label}: 두 키가 모두 비어 있지 않은 문자열이다`, async () => {
      const { infoPlist } = await introspectAsync(props);
      expect(typeof infoPlist[SHARE_USAGE_KEY]).toBe('string');
      expect(typeof infoPlist[UPDATE_USAGE_KEY]).toBe('string');
      expect(infoPlist[SHARE_USAGE_KEY]).not.toBe('');
      expect(infoPlist[UPDATE_USAGE_KEY]).not.toBe('');
    });
  }

  it('write scope가 비어 있어도 Update 키를 쓴다 — scope와 usage string은 다른 축이다', async () => {
    const { infoPlist } = await introspectAsync({ privacyPolicyUrl: URL, read: ['workouts'] });
    expect(infoPlist[UPDATE_USAGE_KEY]).toBe(DEFAULT_UPDATE_USAGE_DESCRIPTION);
  });

  it('기본값은 영어이며 $(PRODUCT_NAME)을 쓴다 (Xcode가 빌드 시점에 치환)', async () => {
    const { infoPlist } = await introspectAsync({ privacyPolicyUrl: URL });
    expect(infoPlist[SHARE_USAGE_KEY]).toBe(DEFAULT_SHARE_USAGE_DESCRIPTION);
    expect(String(infoPlist[SHARE_USAGE_KEY])).toContain('$(PRODUCT_NAME)');
  });

  it('props가 기본값을 이긴다', async () => {
    const { infoPlist } = await introspectAsync({
      privacyPolicyUrl: URL,
      ios: { shareUsageDescription: '읽기 사유', updateUsageDescription: '쓰기 사유' },
    });
    expect(infoPlist[SHARE_USAGE_KEY]).toBe('읽기 사유');
    expect(infoPlist[UPDATE_USAGE_KEY]).toBe('쓰기 사유');
  });
});

describe('§7.2 — UIRequiredDeviceCapabilities에 healthkit을 **넣지 않는다**', () => {
  for (const { label, props } of COMBOS) {
    it(`${label}: 넣으면 HealthKit 없는 기기에서 앱이 설치조차 되지 않는다`, async () => {
      const { infoPlist } = await introspectAsync(props);
      const capabilities = infoPlist['UIRequiredDeviceCapabilities'];
      expect(Array.isArray(capabilities) ? capabilities : []).not.toContain(FORBIDDEN_DEVICE_CAPABILITY);
    });
  }
});

describe('현지화 — 소비자가 `ios.infoPlist`에 이미 쓴 값을 **덮어쓰지 않는다**', () => {
  it('기존 값 > 기본값. 그렇지 않으면 InfoPlist.strings 현지화가 조용히 되돌려진다', async () => {
    const { infoPlist } = await introspectAsync(
      { privacyPolicyUrl: URL },
      { ios: { bundleIdentifier: 'com.gjkit.workoutsfixture', infoPlist: { [SHARE_USAGE_KEY]: '이미 현지화된 문구' } } },
    );
    expect(infoPlist[SHARE_USAGE_KEY]).toBe('이미 현지화된 문구');
    // 손대지 않은 쪽은 여전히 기본값이 채워진다.
    expect(infoPlist[UPDATE_USAGE_KEY]).toBe(DEFAULT_UPDATE_USAGE_DESCRIPTION);
  });

  it('명시 prop은 기존 값도 이긴다 — prop > 기존 > 기본', async () => {
    const { infoPlist } = await introspectAsync(
      { privacyPolicyUrl: URL, ios: { shareUsageDescription: 'prop이 이긴다' } },
      { ios: { bundleIdentifier: 'com.gjkit.workoutsfixture', infoPlist: { [SHARE_USAGE_KEY]: '기존 값' } } },
    );
    expect(infoPlist[SHARE_USAGE_KEY]).toBe('prop이 이긴다');
  });
});
