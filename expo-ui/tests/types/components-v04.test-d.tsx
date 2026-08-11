/** v0.4 interaction foundation — semantic branches and required names. */
import { describe, expectTypeOf, it } from 'vitest';
import { TextInput, View } from 'react-native';
import {
  AspectRatio,
  Card,
  Chip,
  Collapsible,
  FloatingActionButton,
  FormField,
  Link,
  Tabs,
} from '../../src/index';
import type { FormFieldControlProps } from '../../src/index';

const noop = (): void => undefined;

describe('v0.4 Chip — action/filter/removable 의미 분리', () => {
  it('각 branch는 필요한 handler만 허용한다', () => {
    void (<Chip kind="action" label="실행" onPress={noop} />);
    void (<Chip kind="filter" label="완료" selected onSelectedChange={noop} />);
    void (
      <Chip
        kind="removable"
        label="React"
        onRemove={noop}
        removeAccessibilityLabel="React 제거"
      />
    );

    // @ts-expect-error action과 filter handler는 동시에 존재할 수 없다
    void (<Chip kind="action" label="오류" onPress={noop} selected onSelectedChange={noop} />);
    // @ts-expect-error removable 제거 버튼의 접근성 이름은 필수다
    void (<Chip kind="removable" label="React" onRemove={noop} />);
    // @ts-expect-error filter는 controlled selected 값이 필요하다
    void (<Chip kind="filter" label="완료" onSelectedChange={noop} />);
  });
});

describe('v0.4 Link / Card — 이동과 정적 표면 계약', () => {
  it('Link 목적지와 router callback은 상호 배타적이다', () => {
    void (<Link href="/docs">문서</Link>);
    void (<Link href="/docs" onOpenError={() => {}}>문서</Link>);
    void (<Link onPress={noop}>프로필</Link>);
    // @ts-expect-error href 또는 onPress 중 하나는 필요하다
    void (<Link>빈 목적지</Link>);
    // @ts-expect-error href와 onPress를 동시에 지정할 수 없다
    void (<Link href="/docs" onPress={noop}>문서</Link>);
    // @ts-expect-error 앱 라우터 callback에는 Linking 오류 handler가 없다
    void (<Link onPress={noop} onOpenError={() => {}}>프로필</Link>);
    // @ts-expect-error 링크 본문은 안정적인 문자열이어야 한다
    void (<Link href="/docs"><View /></Link>);
  });

  it('Card는 임의의 전체 클릭 action을 소유하지 않는다', () => {
    void (<Card>정적 카드</Card>);
    void (
      <Card style={{ height: 240 }} contentStyle={{ flexDirection: 'row', gap: 12 }}>
        내부 레이아웃을 가진 정적 카드
      </Card>
    );
    // @ts-expect-error Card 전체 action은 중첩 인터랙션을 막기 위해 제공하지 않는다
    void (<Card onPress={noop}>프로필</Card>);
    // @ts-expect-error 정적 Card에는 disabled 상태가 없다
    void (<Card disabled>정적 카드</Card>);
  });
});

describe('v0.4 FormField / Collapsible — 관계와 이름 필수', () => {
  it('FormField render prop은 연결 prop을 정확히 전달한다', () => {
    void (
      <FormField label="이메일" helperText="업무용 주소">
        {(controlProps) => {
          expectTypeOf(controlProps).toEqualTypeOf<FormFieldControlProps>();
          return <TextInput {...controlProps} />;
        }}
      </FormField>
    );
    // @ts-expect-error 보이는 label은 필수다
    void (<FormField>{(props) => <TextInput {...props} />}</FormField>);
    // @ts-expect-error 임의 child clone 대신 render prop만 허용한다
    void (<FormField label="이메일"><TextInput /></FormField>);
    // @ts-expect-error FormField는 실제 제어를 비활성화할 수 없으므로 disabled를 받지 않는다
    void (<FormField label="이메일" disabled>{(props) => <TextInput {...props} />}</FormField>);
    void (
      <FormField label="이메일" required requiredAccessibilityLabel="이메일, 필수">
        {(props) => <TextInput {...props} />}
      </FormField>
    );
    // @ts-expect-error required 필드는 iOS용 현지화 전체 이름도 필수다
    void (<FormField label="이메일" required>{(props) => <TextInput {...props} />}</FormField>);
    // @ts-expect-error required가 아니면 별도 required 이름을 받을 수 없다
    void (<FormField label="이메일" requiredAccessibilityLabel="이메일, 필수">{(props) => <TextInput {...props} />}</FormField>);
  });

  it('Collapsible은 비인터랙티브 문자열 title을 필수로 가진다', () => {
    void (<Collapsible open={false} onOpenChange={noop} title="도움말">내용</Collapsible>);
    // @ts-expect-error 문자열 title은 필수다
    void (<Collapsible open={false} onOpenChange={noop} trigger={<View />}>내용</Collapsible>);
    // @ts-expect-error interactive가 될 수 있는 custom trigger는 허용하지 않는다
    void (<Collapsible open={false} onOpenChange={noop} title="도움말" trigger={<View />}>내용</Collapsible>);
    // @ts-expect-error trigger 안에 중첩될 임의 leading 노드는 허용하지 않는다
    void (<Collapsible open={false} onOpenChange={noop} title="도움말" leading={<View />}>내용</Collapsible>);
  });
});

describe('v0.4 FloatingActionButton / AspectRatio / Tabs', () => {
  it('icon-only FAB는 접근성 이름이 필요하고 extended FAB는 label을 이름으로 쓴다', () => {
    void (<FloatingActionButton icon={<View />} accessibilityLabel="작성" onPress={noop} />);
    void (<FloatingActionButton label="작성" onPress={noop} />);
    // @ts-expect-error icon-only FAB의 action 이름은 필수다
    void (<FloatingActionButton icon={<View />} onPress={noop} />);
  });

  it('AspectRatio와 named Tabs의 올바른 계약을 허용한다', () => {
    void (<AspectRatio ratio={16 / 9}><View /></AspectRatio>);
    void (
      <Tabs
        accessibilityLabel="프로필 섹션"
        items={[{ label: '개요', value: 'overview' }] as const}
        value="overview"
        onChange={noop}
        panels={{ overview: '개요' }}
      />
    );
    void (
      <Tabs
        accessibilityLabel="프로필 섹션"
        items={[
          { label: '개요', value: 'overview' },
          { label: '기록', value: 'history' },
        ] as const}
        value="overview"
        onChange={noop}
        panels={{ overview: '개요', history: '기록' }}
      />
    );
    // @ts-expect-error tablist의 접근성 이름은 필수다
    void (<Tabs items={[{ label: '개요', value: 'overview' }] as const} value="overview" onChange={noop} panels={{ overview: '개요' }} />);
    // @ts-expect-error Tabs는 완전한 tab-panel 관계를 소유해야 한다
    void (<Tabs accessibilityLabel="프로필" items={[{ label: '개요', value: 'overview' }] as const} value="overview" onChange={noop} />);
    void (
      <Tabs
        accessibilityLabel="프로필 섹션"
        items={[
          { label: '개요', value: 'overview' },
          { label: '기록', value: 'history' },
        ] as const}
        value="overview"
        onChange={noop}
        // @ts-expect-error panels는 모든 item value를 가져야 한다
        panels={{ overview: '개요' }}
      />
    );
  });
});

describe('v0.4 공개 컴포넌트 — unstyled 이관 잔재 차단', () => {
  it('7종 모두 unstyled=true를 거부한다', () => {
    // @ts-expect-error unstyled?: never
    void (<Chip kind="action" label="실행" onPress={noop} unstyled />);
    // @ts-expect-error unstyled?: never
    void (<Link href="/" unstyled>홈</Link>);
    // @ts-expect-error unstyled?: never
    void (<Card unstyled>카드</Card>);
    // @ts-expect-error unstyled?: never
    void (<FormField label="필드" unstyled>{(props) => <TextInput {...props} />}</FormField>);
    // @ts-expect-error unstyled?: never
    void (<Collapsible open={false} onOpenChange={noop} title="제목" unstyled>내용</Collapsible>);
    // @ts-expect-error unstyled?: never
    void (<FloatingActionButton label="작성" onPress={noop} unstyled />);
    // @ts-expect-error unstyled?: never
    void (<AspectRatio ratio={1} unstyled />);
  });
});
