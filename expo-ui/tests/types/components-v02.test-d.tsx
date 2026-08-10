/**
 * v0.2 컴포넌트 계약 — 접근 가능한 필수 입력과 controlled generic 상태를
 * 컴파일 단계에서 고정한다.
 */
import { describe, expectTypeOf, it } from 'vitest';
import {
  Accordion,
  Alert,
  Avatar,
  Badge,
  Checkbox,
  Divider,
  ListItem,
  ProgressBar,
  RadioGroup,
  Spinner,
  Switch,
} from '../../src/index';

const noop = (): void => undefined;

const channelItems = [
  { label: '이메일', value: 'email' },
  { label: '문자', value: 'sms' },
] as const;

const accordionItems = [
  { value: 'details', title: '상세 정보', content: '상세 내용' },
  { value: 'billing', title: '결제 정보', content: '결제 내용' },
] as const;

describe('v0.2 Checkbox / Switch — 보이는 label 또는 접근성 label 필수', () => {
  it('두 label 경로는 통과하고 모두 누락하면 실패한다', () => {
    void (<Checkbox checked={false} label="약관 동의" onCheckedChange={noop} />);
    void (
      <Checkbox
        accessibilityLabel="모두 선택"
        checked="mixed"
        onCheckedChange={noop}
      />
    );
    // @ts-expect-error label과 accessibilityLabel을 모두 생략할 수 없다
    void (<Checkbox checked={false} onCheckedChange={noop} />);

    void (<Switch label="알림" value={false} onValueChange={noop} />);
    void (<Switch accessibilityLabel="알림 켜기" value={false} onValueChange={noop} />);
    // @ts-expect-error label과 accessibilityLabel을 모두 생략할 수 없다
    void (<Switch value={false} onValueChange={noop} />);
  });
});

describe('v0.2 ProgressBar — label 필수 + determinate/indeterminate 분리', () => {
  it('determinate만 max를 받고 indeterminate는 max를 거부한다', () => {
    void (<ProgressBar accessibilityLabel="업로드 진행률" value={40} max={80} />);
    void (<ProgressBar accessibilityLabel="업로드 중" value={null} />);
    // @ts-expect-error 진행 대상 accessibilityLabel은 필수다
    void (<ProgressBar value={40} />);
    // @ts-expect-error indeterminate(value=null)는 max를 가질 수 없다
    void (<ProgressBar accessibilityLabel="업로드 중" value={null} max={100} />);
  });
});

describe('v0.2 Alert / Avatar / ListItem — 무의미한 상태를 union으로 차단', () => {
  it('Alert는 title 또는 children 중 하나가 필수다', () => {
    void (<Alert title="저장 완료" />);
    void (<Alert>변경 사항을 저장했습니다.</Alert>);
    // @ts-expect-error title과 children을 모두 생략할 수 없다
    void (<Alert />);
  });

  it('Avatar는 informative alt 또는 decorative=true 중 하나가 필수다', () => {
    void (<Avatar name="김지우" alt="김지우 프로필" />);
    void (<Avatar name="김지우" decorative />);
    // @ts-expect-error 장식이 아닌 Avatar에는 alt가 필수다
    void (<Avatar name="김지우" />);
    // @ts-expect-error decorative Avatar에 모순되는 alt를 함께 줄 수 없다
    void (<Avatar name="김지우" decorative alt="김지우 프로필" />);
  });

  it('정적 ListItem에는 disabled가 없고 interactive에서만 허용된다', () => {
    void (<ListItem title="프로필" />);
    void (<ListItem title="프로필" onPress={noop} disabled />);
    // @ts-expect-error onPress 없는 정적 항목은 disabled 상태를 가질 수 없다
    void (<ListItem title="프로필" disabled />);
  });
});

describe('v0.2 RadioGroup — items의 literal value union 보존', () => {
  it('value와 callback이 email | sms로 닫힌다', () => {
    void (
      <RadioGroup
        accessibilityLabel="연락 수단"
        items={channelItems}
        value="email"
        onValueChange={(value) => {
          expectTypeOf(value).toEqualTypeOf<'email' | 'sms'>();
        }}
      />
    );
    // @ts-expect-error items에 없는 literal value는 선택할 수 없다
    void (<RadioGroup accessibilityLabel="연락 수단" items={channelItems} value="push" onValueChange={noop} />);
  });
});

describe('v0.2 Accordion — single/multiple controlled state 분리', () => {
  it('single은 scalar|null, multiple은 readonly array callback을 제공한다', () => {
    void (
      <Accordion
        items={accordionItems}
        value="details"
        onValueChange={(value) => {
          expectTypeOf(value).toEqualTypeOf<'details' | 'billing' | null>();
        }}
      />
    );
    void (
      <Accordion
        type="multiple"
        items={accordionItems}
        value={['details']}
        onValueChange={(value) => {
          expectTypeOf(value).toEqualTypeOf<readonly ('details' | 'billing')[]>();
        }}
      />
    );
  });

  it('single/multiple value 모양이 뒤바뀌면 실패한다', () => {
    // @ts-expect-error multiple은 배열 value가 필요하다
    void (<Accordion type="multiple" items={accordionItems} value="details" onValueChange={noop} />);
    // @ts-expect-error single은 scalar|null value가 필요하다
    void (<Accordion items={accordionItems} value={['details']} onValueChange={noop} />);
  });
});

describe('v0.2 새 컴포넌트 — unstyled 이관 잔재 전면 차단', () => {
  it('모든 공개 컴포넌트에서 unstyled=true가 never에 막힌다', () => {
    // @ts-expect-error unstyled?: never
    void (<Badge label="신규" unstyled />);
    // @ts-expect-error unstyled?: never
    void (<Alert title="안내" unstyled />);
    // @ts-expect-error unstyled?: never
    void (<Avatar name="김지우" alt="김지우 프로필" unstyled />);
    // @ts-expect-error unstyled?: never
    void (<Divider unstyled />);
    // @ts-expect-error unstyled?: never
    void (<ListItem title="프로필" unstyled />);
    // @ts-expect-error unstyled?: never
    void (<Spinner unstyled />);
    // @ts-expect-error unstyled?: never
    void (<ProgressBar accessibilityLabel="진행률" value={10} unstyled />);
    // @ts-expect-error unstyled?: never
    void (<Checkbox label="선택" checked={false} onCheckedChange={noop} unstyled />);
    // @ts-expect-error unstyled?: never
    void (<Switch label="알림" value={false} onValueChange={noop} unstyled />);
    // @ts-expect-error unstyled?: never
    void (<RadioGroup accessibilityLabel="연락 수단" items={channelItems} value="email" onValueChange={noop} unstyled />);
    // @ts-expect-error unstyled?: never
    void (<Accordion items={accordionItems} value={null} onValueChange={noop} unstyled />);
  });
});
