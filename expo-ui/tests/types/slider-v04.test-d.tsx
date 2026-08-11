import { describe, it } from 'vitest';
import { View } from 'react-native';
import { Slider } from '../../src/index';

describe('Slider — controlled discriminated contracts', () => {
  it('keeps single and range callback shapes distinct', () => {
    void (
      <Slider
        value={50}
        onValueChange={(value) => value.toFixed(0)}
        onValueCommit={(value) => value.toFixed(0)}
        accessibilityLabel="볼륨"
        direction="rtl"
        trackStyle={{ opacity: 0.7 }}
        rangeClassName="range"
        thumbStyle={{ marginTop: 2 }}
      />
    );
    void (
      <Slider
        mode="range"
        value={[20, 80] as const}
        minDistance={10}
        onValueChange={(value) => value[0].toFixed(0)}
        onValueCommit={(value) => value[1].toFixed(0)}
        accessibilityLabels={["낮은 가격", "높은 가격"] as const}
      />
    );

    // @ts-expect-error single slider must have a single accessibility name
    void (<Slider value={50} onValueChange={() => {}} accessibilityLabels={["하나", "둘"] as const} />);
    // @ts-expect-error range slider needs separate names for each thumb
    void (<Slider mode="range" value={[20, 80] as const} onValueChange={() => {}} accessibilityLabel="가격" />);
    // @ts-expect-error range slider needs exactly two accessible thumb names
    void (<Slider mode="range" value={[20, 80] as const} onValueChange={() => {}} accessibilityLabels={["가격"] as const} />);
    // @ts-expect-error range mode requires the tuple, not a scalar
    void (<Slider mode="range" value={20} onValueChange={() => {}} accessibilityLabels={["낮음", "높음"] as const} />);
    // @ts-expect-error a single slider never takes range-only minDistance
    void (<Slider value={20} minDistance={5} onValueChange={() => {}} accessibilityLabel="값" />);
    // @ts-expect-error only ltr/rtl are accepted
    void (<Slider value={20} direction="vertical" onValueChange={() => {}} accessibilityLabel="값" />);
    // @ts-expect-error unstyled is intentionally unavailable across public components
    void (<Slider value={20} onValueChange={() => {}} accessibilityLabel="값" unstyled />);
    // @ts-expect-error Slider owns no arbitrary child composition
    void (<Slider value={20} onValueChange={() => {}} accessibilityLabel="값"><View /></Slider>);
  });
});
