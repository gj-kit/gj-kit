/**
 * MonthCalendar/DateField/달력 수학 타입 계약 — 라운드 E §E3.
 *
 * CalendarDate는 닫힌 평면 객체다: Date는 어느 자리에도 대입될 수 없고(시간대
 * 정직성), renderDay ctx는 전 필드 readonly다. 오용 픽스처는 @ts-expect-error로
 * 고정한다.
 */
import { describe, expectTypeOf, it } from "vitest";
import { DateField, MonthCalendar, buildMonthGrid, compareCalendarDates } from "../../src";
import type {
  CalendarDate,
  CalendarMonth,
  CalendarWeekday,
  CalendarWeekStart,
  DateFieldProps,
  DateFieldSegment,
  MonthCalendarDayContext,
  MonthCalendarProps,
  MonthGrid,
  MonthGridCell,
  MonthGridWeek,
} from "../../src";

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"] as const;
const LABELS = { weekdays: WEEKDAYS, monthTitle: "2026년 8월" } as const;

describe("CalendarDate — 닫힌 평면 shape", () => {
  it("연·월·일 정수 필드만 갖는다", () => {
    expectTypeOf<CalendarDate>().toEqualTypeOf<{
      readonly year: number;
      readonly month: number;
      readonly day: number;
    }>();
    expectTypeOf<CalendarMonth>().toEqualTypeOf<{
      readonly year: number;
      readonly month: number;
    }>();
    expectTypeOf<CalendarWeekday>().toEqualTypeOf<0 | 1 | 2 | 3 | 4 | 5 | 6>();
    expectTypeOf<CalendarWeekStart>().toEqualTypeOf<0 | 1>();
  });

  it("Date와 잉여 속성은 컴파일 에러다", () => {
    // @ts-expect-error — Date는 CalendarDate가 아니다(시간대 정직성).
    const fromDate: CalendarDate = new Date();
    void fromDate;
    // @ts-expect-error — 잉여 속성(hour)은 닫힌 shape 위반.
    const excess: CalendarDate = { year: 2026, month: 8, day: 24, hour: 1 };
    void excess;
    // @ts-expect-error — day 누락.
    const partial: CalendarDate = { year: 2026, month: 8 };
    void partial;
  });

  it("비교·그리드 반환 타입이 닫혀 있다", () => {
    expectTypeOf(compareCalendarDates).returns.toEqualTypeOf<-1 | 0 | 1>();
    expectTypeOf(buildMonthGrid).returns.toEqualTypeOf<MonthGrid>();
    expectTypeOf<MonthGridWeek["length"]>().toEqualTypeOf<7>();
    expectTypeOf<MonthGridCell>().toEqualTypeOf<{
      readonly date: CalendarDate;
      readonly inMonth: boolean;
    }>();
    expectTypeOf<MonthGrid["weeks"]>().toEqualTypeOf<readonly MonthGridWeek[]>();
  });
});

describe("MonthCalendar props 계약", () => {
  it("정상 사용과 renderDay ctx 타입", () => {
    void (
      <MonthCalendar
        month={{ year: 2026, month: 8 }}
        labels={LABELS}
        accessibilityLabel="결제 캘린더"
        value={{ year: 2026, month: 8, day: 24 }}
        onValueChange={(date) => {
          expectTypeOf(date).toEqualTypeOf<CalendarDate>();
        }}
        onMonthChange={(month) => {
          expectTypeOf(month).toEqualTypeOf<CalendarMonth>();
        }}
        weekStartsOn={0}
        today={{ year: 2026, month: 8, day: 24 }}
        renderDay={(context) => {
          expectTypeOf(context).toEqualTypeOf<MonthCalendarDayContext>();
          expectTypeOf(context.date).toEqualTypeOf<CalendarDate>();
          return null;
        }}
        getDayAccessibilityLabel={(context) => `${context.date.day}일`}
      />
    );
    // 표시 전용(선택 없음)도 허용된다.
    void (
      <MonthCalendar
        month={{ year: 2026, month: 8 }}
        labels={LABELS}
        accessibilityLabel="결제 캘린더"
      />
    );
  });

  it("renderDay ctx는 전 필드 readonly다", () => {
    void (
      <MonthCalendar
        month={{ year: 2026, month: 8 }}
        labels={LABELS}
        accessibilityLabel="캘린더"
        renderDay={(context) => {
          // @ts-expect-error — ctx.date는 readonly.
          context.date = { year: 2026, month: 8, day: 1 };
          // @ts-expect-error — ctx.selected는 readonly.
          context.selected = true;
          return null;
        }}
      />
    );
  });

  it("오용은 컴파일 에러다", () => {
    // @ts-expect-error — accessibilityLabel은 필수(그리드 이름).
    void (<MonthCalendar month={{ year: 2026, month: 8 }} labels={LABELS} />);
    // @ts-expect-error — labels는 필수(키트는 copy-free).
    void (<MonthCalendar month={{ year: 2026, month: 8 }} accessibilityLabel="캘린더" />);
    // @ts-expect-error — month는 필수(controlled).
    void (<MonthCalendar labels={LABELS} accessibilityLabel="캘린더" />);
    void (
      <MonthCalendar
        month={{ year: 2026, month: 8 }}
        labels={LABELS}
        accessibilityLabel="캘린더"
        // @ts-expect-error — weekStartsOn은 0 | 1.
        weekStartsOn={2}
      />
    );
    void (
      <MonthCalendar
        month={{ year: 2026, month: 8 }}
        // @ts-expect-error — weekdays는 정확히 7개 tuple.
        labels={{ weekdays: ["일", "월", "화", "수", "목", "금"], monthTitle: "8월" }}
        accessibilityLabel="캘린더"
      />
    );
    void (
      <MonthCalendar
        month={{ year: 2026, month: 8 }}
        labels={LABELS}
        accessibilityLabel="캘린더"
        // @ts-expect-error — Date는 value가 될 수 없다.
        value={new Date()}
      />
    );
    void (
      <MonthCalendar
        month={{ year: 2026, month: 8 }}
        labels={LABELS}
        accessibilityLabel="캘린더"
        // @ts-expect-error — 전신 마이그레이션 잔재 prop 차단.
        unstyled
      />
    );
    void (
      <MonthCalendar
        month={{ year: 2026, month: 8 }}
        labels={LABELS}
        accessibilityLabel="캘린더"
        // @ts-expect-error — getDayAccessibilityLabel은 string을 반환해야 한다.
        getDayAccessibilityLabel={(context) => context.date.day}
      />
    );
  });

  it("MonthCalendarProps 필드 타입이 안정적으로 노출된다", () => {
    expectTypeOf<MonthCalendarProps["value"]>().toEqualTypeOf<
      CalendarDate | null | undefined
    >();
    expectTypeOf<MonthCalendarProps["weekStartsOn"]>().toEqualTypeOf<0 | 1 | undefined>();
    expectTypeOf<MonthCalendarDayContext>().toEqualTypeOf<{
      readonly date: CalendarDate;
      readonly inMonth: boolean;
      readonly today: boolean;
      readonly selected: boolean;
      readonly disabled: boolean;
    }>();
  });
});

describe("DateField props 계약", () => {
  it("controlled value·onValueChange와 세그먼트 순서", () => {
    void (
      <DateField
        value={null}
        onValueChange={(next) => {
          expectTypeOf(next).toEqualTypeOf<CalendarDate | null>();
        }}
        segmentOrder={["month", "day", "year"]}
        minDate={{ year: 2020, month: 1, day: 1 }}
        maxDate={{ year: 2030, month: 12, day: 31 }}
        label="결제일"
        error="필수 항목"
        helperText="도움말"
        segmentLabels={{ year: "년" }}
        segmentPlaceholders={{ year: "YYYY" }}
      />
    );
    expectTypeOf<DateFieldSegment>().toEqualTypeOf<"year" | "month" | "day">();
    expectTypeOf<DateFieldProps["value"]>().toEqualTypeOf<CalendarDate | null>();
  });

  it("오용은 컴파일 에러다", () => {
    // @ts-expect-error — value는 필수(controlled).
    void (<DateField onValueChange={() => {}} />);
    // @ts-expect-error — onValueChange는 필수.
    void (<DateField value={null} />);
    // @ts-expect-error — Date는 value가 될 수 없다.
    void (<DateField value={new Date()} onValueChange={() => {}} />);
    // @ts-expect-error — 문자열 key는 value가 될 수 없다(parseCalendarDateKey를 거쳐라).
    void (<DateField value="2026-08-24" onValueChange={() => {}} />);
    void (
      <DateField
        value={null}
        onValueChange={() => {}}
        // @ts-expect-error — 세그먼트 이름 오타.
        segmentOrder={["years", "month", "day"]}
      />
    );
    // @ts-expect-error — 전신 마이그레이션 잔재 prop 차단.
    void (<DateField value={null} onValueChange={() => {}} unstyled />);
  });
});
