/** SearchField keeps its focused input/a11y surface narrow and explicit. */
import { describe, it } from 'vitest';
import { SearchField } from '../../src/index';

describe('SearchField accessibility input contract', () => {
  it('accepts named, described, and disabled search inputs', () => {
    void (
      <SearchField
        accessibilityHint="Searches saved activities"
        accessibilityLabel="Search activities"
        accessibilityLabelledBy="activity-search-label"
        accessibilityState={{ disabled: true }}
        aria-describedby="activity-search-help"
        aria-disabled
        aria-labelledby="activity-search-label"
        editable={false}
        nativeID="activity-search"
      />
    );
  });

  it('does not widen into an arbitrary TextInput surface', () => {
    // @ts-expect-error SearchField remains a single-line search control
    void (<SearchField multiline />);
  });
});
