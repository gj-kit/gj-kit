import { describe, expect, it } from "vitest";
import type { PickedAsset } from "../../src/core/adapters";
import { mediaErrorCode } from "../../src/core/errors";
import { createMediaPickerActions } from "../../src/core/pickerActions";
import { createFakePicker } from "../../src/testing";

const asset = (index: number): PickedAsset => ({
  uri: `file:///dcim/a${index}.jpg`,
  assetId: `A${index}`,
  fileName: `a${index}.jpg`,
});

describe("createMediaPickerActions", () => {
  it("owns library permission, selection limits, and normalized picker output without upload setup", async () => {
    const picker = createFakePicker([asset(0), asset(1), asset(2)]);
    const actions = createMediaPickerActions({ picker });

    const picked = await actions.pick({ max: 2 });

    expect(picker.calls.libraryPermission).toEqual([["image"]]);
    expect(picker.calls.pick).toEqual([{ kinds: ["image"], max: 2 }]);
    expect(picked.map((item) => item.assetId)).toEqual(["A0", "A1"]);
  });

  it("returns one camera asset and skips capture after a denied permission", async () => {
    const picker = createFakePicker([asset(0)], {
      captureAssets: [asset(0), asset(1)],
      cameraPermission: { granted: false, canAskAgain: true, limited: false },
    });
    const actions = createMediaPickerActions({ picker });

    const error = await actions.capture().catch((thrown: unknown) => thrown);

    expect(mediaErrorCode(error)).toBe("permission-denied");
    expect(picker.calls.capture).toEqual([]);
  });
});
