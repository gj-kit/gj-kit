// 설계 문서 §7.1 첫 행 — **iOS 원본 fast path 고정 조합의 상수 스냅샷**.
//
// 지키는 것: `quality:1` · `exif:true` · `allowsEditing:false` ·
// `preferredAssetRepresentationMode: Current` 네 값이 **함께** 남아 있고, 라이브러리 피커와
// 카메라가 앞의 셋을 **글자 그대로 공유**한다는 것. 하나라도 갈리면 같은 사진이 선택 방식에 따라
// 다른 바이트로 업로드되고, 그 차이는 서버가 업로드를 거절할 때에야 드러난다(§7 하드닝 3).
//
// ⚠ **왜 import가 아니라 소스 스냅샷인가**: `src/picker/expo.ts`를 import하면
//   `expo-image-picker`가 **테스트 그래프에 들어온다** — 그것이 정확히 §10.3 `test-purity-guard`가
//   막는 것이고, 목표 (a)("expo 모킹 0")의 포기다. 상수의 값은 소스 텍스트에 리터럴로 있으므로
//   읽어서 대조하는 것으로 충분하다.

import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const PACKAGE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const SOURCE = readFileSync(join(PACKAGE_ROOT, 'src', 'picker', 'expo.ts'), 'utf8');

/** `const <name> = { … } as const;` 의 본문. 선언이 사라지면 `null`이다. */
function declarationBody(name: string): string | null {
  const match = SOURCE.match(new RegExp(`const ${name} = \\{([\\s\\S]*?)\\} as const;`));
  return match?.[1] ?? null;
}

describe('ORIGINAL_LIBRARY_PICKER_OPTIONS — 네 값이 함께여야 의미가 있다', () => {
  const body = declarationBody('ORIGINAL_LIBRARY_PICKER_OPTIONS');

  it('선언이 존재한다 (사라지면 fast path 자체가 없어진 것이다)', () => {
    expect(body).not.toBeNull();
  });

  it.each([
    ['quality: 1', '재인코딩 금지 — < 1이면 asset.fileSize가 원본 크기를 보고한다'],
    ['exif: true', 'EXIF가 없으면 촬영 시각·위치가 유실된다'],
    ['allowsEditing: false', '크롭 UI는 원본이 아닌 파생물을 만든다'],
  ])('%s (%s)', (entry) => {
    expect(body).toContain(entry);
  });

  it('preferredAssetRepresentationMode는 Current다 — HEIC 트랜스코딩 차단', () => {
    expect(body?.replace(/\s+/g, ' ')).toContain(
      'preferredAssetRepresentationMode: ImagePicker.UIImagePickerPreferredAssetRepresentationMode.Current',
    );
  });
});

describe('BASE_PICKER_OPTIONS — 카메라 경로가 앞의 셋을 글자 그대로 공유한다', () => {
  const body = declarationBody('BASE_PICKER_OPTIONS');

  it('세 값이 동일하다', () => {
    expect(body).toContain('quality: 1');
    expect(body).toContain('exif: true');
    expect(body).toContain('allowsEditing: false');
  });

  it('preferredAssetRepresentationMode는 없다 — 방금 촬영한 프레임에는 그 개념이 없다', () => {
    expect(body).not.toContain('preferredAssetRepresentationMode');
  });
});

describe('고정 조합은 단일선택/다중선택 양쪽이 공유한다', () => {
  it('launchImageLibraryAsync 호출이 libraryOptions를 스프레드한다', () => {
    const call = SOURCE.match(/launchImageLibraryAsync\(\{([\s\S]*?)\}\);/)?.[1] ?? '';
    expect(call).toContain('...libraryOptions');
    // 선택 UI만 갈리고 바이트 경로는 갈리지 않는다.
    expect(call).toContain('allowsMultipleSelection: input.max > 1');
    expect(call).toContain('selectionLimit: input.max');
  });

  it('상수를 배럴로 내보내지 않는다 — 개별 값을 갈아끼울 수 있으면 고정 조합이 아니다', () => {
    const barrel = readFileSync(join(PACKAGE_ROOT, 'src', 'picker.ts'), 'utf8');
    expect(barrel).not.toContain('ORIGINAL_LIBRARY_PICKER_OPTIONS');
  });
});
