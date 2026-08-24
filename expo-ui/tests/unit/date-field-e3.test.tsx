/**
 * DateField — 라운드 E §E3.
 *
 * 커밋 의미론을 정확히 고정한다:
 * 세 세그먼트가 완성(연 4·월 2·일 2자리)되는 순간에만 커밋하고, 커밋 시
 * 월→1-12, 일→그 달의 실제 길이, 결과→min/max로 클램프한다. 전부 비우면
 * null을 커밋한다. 미완성 draft는 로컬에 머문다. blur는 한 자리 월·일만
 * zero-pad하고 연도는 세기 추측을 하지 않는다.
 */
import { useState } from 'react';
import type { ReactElement } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Platform } from 'react-native';
import { DateField } from '../../src/components/date-field';
import type { DateFieldProps } from '../../src/components/date-field';
import type { CalendarDate } from '../../src/dates/calendar';
import { UiProvider } from '../../src/components/provider';
import { koStrings } from '../../src/strings/strings';

function withPlatformOS<T>(os: 'ios' | 'web', run: () => T): T {
  const descriptor = Object.getOwnPropertyDescriptor(Platform, 'OS');
  Object.defineProperty(Platform, 'OS', { configurable: true, value: os });
  try {
    return run();
  } finally {
    if (descriptor === undefined) delete (Platform as { OS?: string }).OS;
    else Object.defineProperty(Platform, 'OS', descriptor);
  }
}

function renderField(overrides: Partial<DateFieldProps> = {}) {
  const onValueChange = overrides.onValueChange ?? vi.fn();
  const result = render(
    <UiProvider>
      <DateField
        value={null}
        {...overrides}
        onValueChange={onValueChange}
        testID={overrides.testID ?? 'df'}
      />
    </UiProvider>,
  );
  return { ...result, onValueChange };
}

function segment(name: 'year' | 'month' | 'day'): HTMLInputElement {
  return screen.getByTestId(`df-${name}`) as HTMLInputElement;
}

function type(input: HTMLElement, value: string): void {
  fireEvent.change(input, { target: { value } });
}

describe('구조·접근성', () => {
  it('기본 ymd 순서로 spinbutton 세 개를 렌더하고 그룹이 label로 이름지어진다', () => {
    renderField({ label: '결제일' });
    screen.getByRole('group', { name: '결제일' });
    const spinbuttons = screen.getAllByRole('spinbutton');
    expect(spinbuttons.map((input) => input.getAttribute('aria-label'))).toEqual([
      'Year',
      'Month',
      'Day',
    ]);
    expect(spinbuttons[0]?.getAttribute('aria-valuemin')).toBe('1');
    expect(spinbuttons[0]?.getAttribute('aria-valuemax')).toBe('9999');
    expect(spinbuttons[1]?.getAttribute('aria-valuemax')).toBe('12');
    expect(spinbuttons[2]?.getAttribute('aria-valuemax')).toBe('31');
  });

  it('segmentOrder가 표시 순서를 바꾼다', () => {
    renderField({ segmentOrder: ['month', 'day', 'year'] });
    const spinbuttons = screen.getAllByRole('spinbutton');
    expect(spinbuttons.map((input) => input.getAttribute('aria-label'))).toEqual([
      'Month',
      'Day',
      'Year',
    ]);
  });

  it('ko Provider 문자열과 segmentLabels 오버라이드가 세그먼트 이름을 정한다', () => {
    render(
      <UiProvider strings={koStrings}>
        <DateField value={null} onValueChange={vi.fn()} segmentLabels={{ day: '날' }} />
      </UiProvider>,
    );
    const spinbuttons = screen.getAllByRole('spinbutton');
    expect(spinbuttons.map((input) => input.getAttribute('aria-label'))).toEqual([
      '년',
      '월',
      '날',
    ]);
  });

  it('value가 zero-pad로 표시되고 aria-valuenow를 나른다', () => {
    renderField({ value: { year: 2026, month: 8, day: 3 } });
    expect(segment('year').value).toBe('2026');
    expect(segment('month').value).toBe('08');
    expect(segment('day').value).toBe('03');
    expect(segment('day').getAttribute('aria-valuenow')).toBe('3');
    expect(segment('year').getAttribute('aria-valuenow')).toBe('2026');
  });

  it('error가 helper보다 우선하고 세그먼트에 aria-invalid를 건다', () => {
    renderField({ label: '결제일', error: '필수 항목', helperText: '도움말' });
    expect(screen.getByText('필수 항목')).toBeTruthy();
    expect(screen.queryByText('도움말')).toBeNull();
    for (const input of screen.getAllByRole('spinbutton')) {
      expect(input.getAttribute('aria-invalid')).toBe('true');
    }
  });

  it('helper/error 관계는 각 세그먼트가 나른다 — aria-describedby·aria-errormessage', () => {
    renderField({ label: '결제일', error: '필수 항목' });
    for (const input of screen.getAllByRole('spinbutton')) {
      const described = input.getAttribute('aria-describedby');
      expect(described).not.toBeNull();
      // aria-errormessage는 aria-invalid=true인 요소에서만 유효 — 세그먼트가 그 요소다.
      expect(input.getAttribute('aria-errormessage')).toBe(described);
      expect(input.getAttribute('aria-invalid')).toBe('true');
      expect(document.getElementById(described ?? '')?.textContent).toBe('필수 항목');
    }
  });

  it('일 aria-valuemax는 연·월이 알려지면 그 달의 실제 길이다', () => {
    renderField({ value: { year: 2026, month: 4, day: 30 } });
    expect(segment('day').getAttribute('aria-valuemax')).toBe('30');
    renderField({ value: { year: 2024, month: 2, day: 1 }, testID: 'df2' });
    expect(screen.getByTestId('df2-day').getAttribute('aria-valuemax')).toBe('29');
  });

  it('disabled면 편집 불가(readOnly)다', () => {
    renderField({ disabled: true });
    expect(segment('year').hasAttribute('readonly')).toBe(true);
  });

  it('segmentOrder가 순열이 아니면 config 오류다', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      expect(() =>
        renderField({ segmentOrder: ['year', 'year', 'day'] as never }),
      ).toThrow(/segmentOrder/);
      expect(() =>
        renderField({ value: { year: 2026, month: 2, day: 30 } }),
      ).toThrow(/value/);
      expect(() =>
        renderField({
          minDate: { year: 2026, month: 9, day: 1 },
          maxDate: { year: 2026, month: 8, day: 1 },
        }),
      ).toThrow(/minDate/);
    } finally {
      spy.mockRestore();
    }
  });
});

describe('커밋 의미론 — 완성 전엔 로컬, 완성 순간 클램프 커밋', () => {
  it('연 4자리·월 2자리 입력마다 자동 전진하고 일이 완성되는 순간 한 번 커밋한다', () => {
    const { onValueChange } = renderField();
    type(segment('year'), '2026');
    expect(document.activeElement).toBe(segment('month'));
    expect(onValueChange).not.toHaveBeenCalled();
    type(segment('month'), '08');
    expect(document.activeElement).toBe(segment('day'));
    expect(onValueChange).not.toHaveBeenCalled();
    type(segment('day'), '24');
    expect(onValueChange).toHaveBeenCalledTimes(1);
    expect(onValueChange).toHaveBeenCalledWith({ year: 2026, month: 8, day: 24 });
  });

  it('이어질 수 없는 첫 자리는 즉시 0-pad 완성된다 — 월 2-9, 일 4-9', () => {
    const { onValueChange } = renderField();
    type(segment('year'), '2026');
    type(segment('month'), '9');
    expect(segment('month').value).toBe('09');
    expect(document.activeElement).toBe(segment('day'));
    type(segment('day'), '4');
    expect(segment('day').value).toBe('04');
    expect(onValueChange).toHaveBeenCalledWith({ year: 2026, month: 9, day: 4 });
  });

  it('월 1·일 1-3의 첫 자리는 부분 입력으로 남는다', () => {
    const { onValueChange } = renderField();
    type(segment('year'), '2026');
    type(segment('month'), '1');
    expect(segment('month').value).toBe('1');
    expect(document.activeElement).toBe(segment('month'));
    expect(onValueChange).not.toHaveBeenCalled();
  });

  it('일 오버플로는 커밋 시 그 달의 실제 길이로 클램프된다 — 1/31에서 월을 02로', () => {
    const { onValueChange } = renderField({ value: { year: 2026, month: 1, day: 31 } });
    type(segment('month'), '02');
    expect(onValueChange).toHaveBeenCalledWith({ year: 2026, month: 2, day: 28 });
  });

  it('커밋 결과는 minDate/maxDate로 클램프된다', () => {
    const { onValueChange } = renderField({
      minDate: { year: 2026, month: 1, day: 10 },
    });
    type(segment('year'), '2026');
    type(segment('month'), '01');
    type(segment('day'), '05');
    expect(onValueChange).toHaveBeenCalledWith({ year: 2026, month: 1, day: 10 });
  });

  it('세 세그먼트를 전부 비우면 null을 커밋한다 — 일부만 비우면 로컬', () => {
    const { onValueChange } = renderField({ value: { year: 2026, month: 8, day: 24 } });
    type(segment('year'), '');
    type(segment('month'), '');
    expect(onValueChange).not.toHaveBeenCalled();
    type(segment('day'), '');
    expect(onValueChange).toHaveBeenCalledTimes(1);
    expect(onValueChange).toHaveBeenCalledWith(null);
  });

  it('value가 이미 null이면 비워도 다시 null을 커밋하지 않는다', () => {
    const { onValueChange } = renderField();
    type(segment('year'), '20');
    type(segment('year'), '');
    expect(onValueChange).not.toHaveBeenCalled();
  });

  it('부모 value 변경이 로컬 draft를 버리고 표시를 갱신한다', () => {
    function Harness(): ReactElement {
      const [value, setValue] = useState<CalendarDate | null>(null);
      return (
        <UiProvider>
          <DateField value={value} onValueChange={setValue} testID="df" />
        </UiProvider>
      );
    }
    render(<Harness />);
    type(segment('year'), '2026');
    type(segment('month'), '08');
    type(segment('day'), '24');
    // 커밋 → 부모 value 갱신 → draft 폐기 후에도 표시는 동일하다.
    expect(segment('year').value).toBe('2026');
    expect(segment('month').value).toBe('08');
    expect(segment('day').value).toBe('24');
    // 이어서 월만 부분 수정하면 커밋 없이 로컬에 머문다.
    type(segment('month'), '1');
    expect(segment('month').value).toBe('1');
    expect(segment('year').value).toBe('2026');
  });
});

describe('blur 정규화', () => {
  it('한 자리 월은 blur에 0-pad되고 미완성이면 커밋되지 않는다', () => {
    const { onValueChange } = renderField();
    type(segment('month'), '1');
    fireEvent.blur(segment('month'));
    expect(segment('month').value).toBe('01');
    expect(onValueChange).not.toHaveBeenCalled();
  });

  it('짧은 연도는 blur에도 pad되지 않는다 — 세기 추측 없음', () => {
    const { onValueChange } = renderField();
    type(segment('year'), '26');
    fireEvent.blur(segment('year'));
    expect(segment('year').value).toBe('26');
    expect(onValueChange).not.toHaveBeenCalled();
  });

  it('완성된 draft는 blur에 폐기되어 controlled value로 스냅백한다', () => {
    // 부모가 커밋을 무시(value 고정 null) — blur 후 표시는 value를 따라 비워진다.
    const { onValueChange } = renderField();
    type(segment('year'), '2026');
    type(segment('month'), '08');
    type(segment('day'), '24');
    expect(onValueChange).toHaveBeenCalledWith({ year: 2026, month: 8, day: 24 });
    fireEvent.blur(segment('day'));
    expect(segment('year').value).toBe('');
    expect(segment('month').value).toBe('');
    expect(segment('day').value).toBe('');
  });
});

describe('키보드 — 화살표 증감과 backspace 후진', () => {
  it('ArrowUp/Down이 세그먼트를 증감하며 완성 상태에선 즉시 커밋한다', () => {
    const { onValueChange } = renderField({ value: { year: 2026, month: 8, day: 24 } });
    fireEvent.keyDown(segment('month'), { key: 'ArrowUp' });
    expect(onValueChange).toHaveBeenCalledWith({ year: 2026, month: 9, day: 24 });
  });

  it('증감은 세그먼트 범위에서 클램프된다 — 월 1에서 ArrowDown은 변화 없음', () => {
    const { onValueChange } = renderField({ value: { year: 2026, month: 1, day: 15 } });
    fireEvent.keyDown(segment('month'), { key: 'ArrowDown' });
    expect(segment('month').value).toBe('01');
    expect(onValueChange).not.toHaveBeenCalled();
  });

  it('일 증감 상한은 연·월이 알려진 경우 그 달의 실제 길이다', () => {
    const { onValueChange } = renderField({ value: { year: 2026, month: 2, day: 28 } });
    fireEvent.keyDown(segment('day'), { key: 'ArrowUp' });
    expect(segment('day').value).toBe('28');
    expect(onValueChange).not.toHaveBeenCalled();
  });

  it('빈 세그먼트는 화살표에 반응하지 않는다 — clock-free라 시드할 오늘이 없다', () => {
    const { onValueChange } = renderField();
    fireEvent.keyDown(segment('year'), { key: 'ArrowUp' });
    expect(segment('year').value).toBe('');
    expect(onValueChange).not.toHaveBeenCalled();
  });

  it('짧은 연도 draft도 화살표에 반응하지 않는다 — pad도 커밋도 없다(세기 추측 금지)', () => {
    const { onValueChange } = renderField({ value: { year: 2026, month: 8, day: 15 } });
    type(segment('year'), '26');
    fireEvent.keyDown(segment('year'), { key: 'ArrowUp' });
    expect(segment('year').value).toBe('26');
    expect(onValueChange).not.toHaveBeenCalled();
    fireEvent.keyDown(segment('year'), { key: 'ArrowDown' });
    expect(segment('year').value).toBe('26');
    expect(onValueChange).not.toHaveBeenCalled();
  });

  it('빈 세그먼트에서 Backspace는 이전 세그먼트로 포커스를 돌린다', () => {
    renderField();
    type(segment('year'), '2026'); // 자동 전진 → month
    expect(document.activeElement).toBe(segment('month'));
    fireEvent.keyDown(segment('month'), { key: 'Backspace' });
    expect(document.activeElement).toBe(segment('year'));
  });
});

describe('네이티브 의미론', () => {
  it('세 입력이 필드 label과 결합된 명확한 레이블을 갖는다', () => {
    withPlatformOS('ios', () => {
      renderField({ label: '결제일' });
      expect(segment('year').getAttribute('aria-label')).toBe('결제일, Year');
      expect(segment('month').getAttribute('aria-label')).toBe('결제일, Month');
      expect(segment('day').getAttribute('aria-label')).toBe('결제일, Day');
    });
  });
});
