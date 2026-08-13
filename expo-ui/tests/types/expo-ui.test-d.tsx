/**
 * 공개 API 타입 강제 픽스처 — 설계 문서 §6 전부.
 *
 * 각 강제 지점마다 오용(@ts-expect-error) + 정상 경로 컴파일 확인을 병행한다.
 * @ts-expect-error가 "사용되지 않음"(TS2578)으로 실패하면 그 강제는 실제로
 * 성립하지 않는 것이다.
 *
 * vitest typecheck 전용(typecheck.only) — 이 파일의 코드는 실행되지 않으므로
 * Provider 없이 훅·JSX를 타입 수준에서만 검사한다.
 */
import { describe, expectTypeOf, it } from 'vitest';
import { View } from 'react-native';
import {
  Button,
  EmptyState,
  IconButton,
  Surface,
  Tabs,
  Text,
  TextField,
  UiProvider,
  createTheme,
  createThemes,
  defaultThemes,
  koStrings,
  lightTheme,
  resolveTheme,
  useTheme,
  useToastController,
} from '../../src/index';
import type { RenderIcon, Theme, ThemePair, ToastPayload } from '../../src/index';

const noop = (): void => undefined;
const gear: RenderIcon = () => null;

describe('§6 ① UiProvider theme 브랜드 — 손조립 토큰 객체 차단', () => {
  it('손조립 theme 객체는 브랜드 미보유로 컴파일 에러', () => {
    // @ts-expect-error 키 누락이 런타임 undefined 스타일로 새는 사고 차단 — Theme은 createTheme 경유로만 존재
    void (<UiProvider theme={{ colors: { primary: 'red' } }} />);
  });

  it('createTheme 결과·내장 테마·ThemePair는 통과', () => {
    void (<UiProvider theme={createTheme('light')} />);
    void (<UiProvider theme={lightTheme} />);
    void (<UiProvider theme={defaultThemes} />);
  });
});

describe('§6 ② IconButton accessibilityLabel 필수', () => {
  it('accessibilityLabel 누락은 컴파일 에러 — 스크린리더 공백 방지', () => {
    // @ts-expect-error accessibilityLabel 누락
    void (<IconButton icon={gear} onPress={noop} />);
  });

  it('accessibilityLabel이 있으면 통과', () => {
    void (<IconButton accessibilityLabel="설정 열기" icon={gear} onPress={noop} />);
    void (<IconButton accessibilityLabel="권한 없음" icon={gear} disabled />);
    void (<IconButton accessibilityLabel="저장 중" icon={gear} loading />);
    // @ts-expect-error enabled IconButton requires a real action
    void (<IconButton accessibilityLabel="설정 열기" icon={gear} />);
  });
});

describe('§6 ③ Button 내용 필수 — label·children 둘 다 없으면 에러', () => {
  it('label도 children도 없는 버튼은 컴파일 에러 (아이콘 단독은 IconButton)', () => {
    // @ts-expect-error label/children 모두 누락 — 내용 없는 버튼 차단
    void (<Button icon={gear} onPress={noop} />);
  });

  it('label만 있는 버튼은 통과', () => {
    void (<Button label="저장" onPress={noop} />);
    void (<Button label="취소" variant="ghost" onPress={noop} />);
    void (<Button label="권한 없음" disabled />);
    void (<Button label="저장 중" loading />);
    // @ts-expect-error enabled Button requires a real action
    void (<Button label="저장" />);
  });

  it('children만 있는 버튼은 통과', () => {
    void (<Button onPress={noop}>저장</Button>);
    void (
      <Button accessibilityLabel="사용자 정보 열기" onPress={noop}>
        <View />
      </Button>
    );
    // @ts-expect-error rich children have no reliable inferred accessible name
    void (<Button onPress={noop}><View /></Button>);
  });
});

describe('§6 ④ Tabs NoInfer — value 오타가 items 추론을 오염시키지 못함', () => {
  it("items 리터럴에 없는 value 'alL'은 컴파일 에러", () => {
    // @ts-expect-error 'alL'은 'all' | 'photo'에 없다 — NoInfer가 T 확장을 차단
    void (<Tabs accessibilityLabel="콘텐츠" items={[{ label: '전체', value: 'all' }, { label: '사진', value: 'photo' }]} value="alL" onChange={noop} panels={{ all: '전체', photo: '사진' }} />);
  });

  it('올바른 value는 통과하고 onChange 인자는 리터럴 유니언으로 추론된다', () => {
    void (
      <Tabs
        accessibilityLabel="콘텐츠"
        items={[
          { label: '전체', value: 'all' },
          { label: '사진', value: 'photo' },
        ]}
        value="photo"
        panels={{ all: '전체', photo: '사진' }}
        onChange={(next) => {
          expectTypeOf(next).toEqualTypeOf<'all' | 'photo'>();
        }}
      />
    );
  });
});

describe('§6 ⑤ UiProvider strings 완전 객체 강제', () => {
  it('부분 객체는 컴파일 에러 — 누락 키가 조용히 영어로 새는 것 방지', () => {
    // @ts-expect-error Partial<UiStrings> 불가 — 완전한 UiStrings만
    void (<UiProvider strings={{ retry: '다시' }} />);
  });

  it('내장 번들 스프레드 + 일부 교체는 통과', () => {
    void (<UiProvider strings={{ ...koStrings, retry: '다시' }} />);
  });
});

describe('§6 ⑥ 토큰 키 유니언 — Surface padding 오타 차단', () => {
  it("존재하지 않는 SpacingKey 'x1'은 컴파일 에러", () => {
    // @ts-expect-error 'x1'은 SpacingKey가 아니다
    void (<Surface padding="x1" />);
  });

  it('토큰 키와 숫자 탈출구는 통과', () => {
    void (<Surface padding="lg" />);
    void (<Surface padding={13} />);
  });
});

describe('§6 ⑦ unstyled 잔재 — 직접 지정·스프레드 경유 모두 차단', () => {
  it('직접 지정은 컴파일 에러', () => {
    // @ts-expect-error unstyled?: never — 이관 잔재 prop 차단
    void (<Button label="x" unstyled />);
  });

  it('{...props} 스프레드 경유도 컴파일 에러', () => {
    const legacyProps = { label: 'x', unstyled: true as const };
    // @ts-expect-error 스프레드로 흘러들어온 unstyled: true도 never에 막힌다
    void (<Button {...legacyProps} />);
  });

  it('unstyled 없는 스프레드는 통과', () => {
    const cleanProps = { label: 'x', onPress: noop };
    void (<Button {...cleanProps} />);
  });
});

describe('§6 ⑧ TextField 구 style 의미 차단', () => {
  it('style은 컴파일 에러 — 구 라이브러리의 "입력 스타일" 의미 무경고 이관 방지', () => {
    // @ts-expect-error style?: never — containerStyle/inputStyle로 명시 이관 강제
    void (<TextField style={{ padding: 4 }} />);
  });

  it('containerStyle·inputStyle은 통과', () => {
    void (<TextField containerStyle={{ padding: 4 }} inputStyle={{ color: '#111111' }} />);
  });
});

describe('§6 ⑨ EmptyState 죽은 버튼 차단 — action 객체 구조 강제', () => {
  it('onPress 없는 action은 컴파일 에러', () => {
    // @ts-expect-error onPress 누락 — label만 있는 죽은 버튼 불가
    void (<EmptyState action={{ label: '추가' }} />);
  });

  it('완전한 action은 통과', () => {
    void (<EmptyState action={{ label: '추가', onPress: noop }} />);
  });
});

describe('§6 ⑩ Text 닫힌 color 유니언 — raw 색 문자열 차단', () => {
  it('raw 문자열 색은 컴파일 에러', () => {
    // @ts-expect-error '#FF0000'은 ColorKey가 아니다 — 닫힌 유니언
    void (<Text color="#FF0000" />);
  });

  it('토큰 키 color는 통과', () => {
    void (<Text color="primary">본문</Text>);
  });

  it('style 탈출구로는 raw 색이 통과', () => {
    void (<Text style={{ color: '#FF0000' }}>탈출구</Text>);
  });
});

describe('§3.3/§3.4/§5.11 공개 타입 표면 (expectTypeOf)', () => {
  it('useTheme() 반환은 Theme', () => {
    expectTypeOf(useTheme).returns.toEqualTypeOf<Theme>();
  });

  it('createTheme/createThemes 반환은 Theme/ThemePair', () => {
    expectTypeOf(createTheme).returns.toEqualTypeOf<Theme>();
    expectTypeOf(createThemes).returns.toEqualTypeOf<ThemePair>();
  });

  it('resolveTheme always returns a concrete Theme', () => {
    expectTypeOf(resolveTheme).returns.toEqualTypeOf<Theme>();
  });

  it('useToastController는 ToastPayload 확장 제네릭을 유지한다', () => {
    type UndoToast = ToastPayload & { undoId: string };
    expectTypeOf(useToastController<UndoToast>).returns.toEqualTypeOf<{
      toast: UndoToast | null;
      showToast: (toast: UndoToast) => void;
      clearToast: () => void;
    }>();
    expectTypeOf(useToastController<ToastPayload>).returns.toEqualTypeOf<{
      toast: ToastPayload | null;
      showToast: (toast: ToastPayload) => void;
      clearToast: () => void;
    }>();
  });
});
