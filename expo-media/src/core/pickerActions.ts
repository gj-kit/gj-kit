// OS picker/camera의 선택 전용 플로우.
//
// 업로드와 무관하게 권한 확인, 결과 상한, host adapter 경계 정규화를 한 곳에서 제공한다.
// OCR·프로필 편집처럼 선택한 파일을 앱 자체 처리 파이프라인으로 넘기는 화면도 이 API를 쓴다.

import type { MediaKind, PickedAsset, PickerAdapter } from "./adapters";
import { MediaError } from "./errors";
import type { MediaStrings } from "./strings";
import { enMediaStrings } from "./strings";

const DEFAULT_PICK_KINDS: readonly MediaKind[] = ["image"];
const DEFAULT_PICK_MAX = 12;

export type MediaPickOptions = {
  readonly max?: number | undefined;
  readonly kinds?: readonly MediaKind[] | undefined;
};

export interface MediaPickerActions {
  /** Request library permission and return at most `max` normalized assets. */
  pick(options?: MediaPickOptions | undefined): Promise<readonly PickedAsset[]>;
  /** Request camera permission and return at most one normalized asset. */
  capture(
    options?: { readonly kind?: MediaKind | undefined } | undefined
  ): Promise<readonly PickedAsset[]>;
}

/**
 * Picker adapters are host code, so their runtime result is not trusted merely because the
 * TypeScript interface says `PickedAsset[]`. Copy exactly the fields this flow owns before an
 * asset crosses into application code; a getter/Proxy cannot later replace a safe file name with
 * a raw URL-shaped value.
 */
function snapshotPickedAssets(
  value: unknown,
  max: number
): readonly PickedAsset[] | null {
  if (!Array.isArray(value)) return null;
  const snapshots: PickedAsset[] = [];
  const count = Math.min(value.length, max);
  for (let index = 0; index < count; index += 1) {
    const source = value[index];
    if (typeof source !== "object" || source === null || Array.isArray(source))
      return null;
    const record = source as Record<string, unknown>;
    const uri = record["uri"];
    const assetId = record["assetId"];
    const fileName = record["fileName"];
    const mimeType = record["mimeType"];
    const width = record["width"];
    const height = record["height"];
    const durationRaw = record["durationRaw"];
    const exif = record["exif"];
    const verifiedSizeBytes = record["verifiedSizeBytes"];
    const reportedSizeBytes = record["reportedSizeBytes"];
    if (
      typeof uri !== "string" ||
      uri.length === 0 ||
      (assetId !== undefined && typeof assetId !== "string") ||
      (fileName !== undefined && typeof fileName !== "string") ||
      (mimeType !== undefined && typeof mimeType !== "string") ||
      (width !== undefined &&
        (!Number.isFinite(width) || typeof width !== "number")) ||
      (height !== undefined &&
        (!Number.isFinite(height) || typeof height !== "number")) ||
      (durationRaw !== undefined &&
        (!Number.isFinite(durationRaw) || typeof durationRaw !== "number")) ||
      (verifiedSizeBytes !== undefined &&
        (!Number.isFinite(verifiedSizeBytes) ||
          typeof verifiedSizeBytes !== "number")) ||
      (reportedSizeBytes !== undefined &&
        (!Number.isFinite(reportedSizeBytes) ||
          typeof reportedSizeBytes !== "number")) ||
      (exif !== undefined &&
        (typeof exif !== "object" || exif === null || Array.isArray(exif)))
    ) {
      return null;
    }
    snapshots.push({
      uri,
      ...(assetId !== undefined ? { assetId } : {}),
      ...(fileName !== undefined ? { fileName } : {}),
      ...(mimeType !== undefined ? { mimeType } : {}),
      ...(width !== undefined ? { width } : {}),
      ...(height !== undefined ? { height } : {}),
      ...(durationRaw !== undefined ? { durationRaw } : {}),
      ...(exif !== undefined
        ? { exif: exif as Readonly<Record<string, unknown>> }
        : {}),
      ...(verifiedSizeBytes !== undefined ? { verifiedSizeBytes } : {}),
      ...(reportedSizeBytes !== undefined ? { reportedSizeBytes } : {}),
    });
  }
  return snapshots;
}

/**
 * Build an upload-independent camera and library picker flow.
 *
 * This is the right boundary for app-owned workflows such as crop, image analysis, and OCR:
 * it owns OS permissions and untrusted picker-result normalization, while the app owns what it
 * does with the returned local URI.
 */
export function createMediaPickerActions(input: {
  readonly picker: PickerAdapter;
  readonly strings?: MediaStrings | undefined;
}): MediaPickerActions {
  const { picker } = input;
  const strings = input.strings ?? enMediaStrings;

  return {
    async pick(options) {
      const kinds = options?.kinds ?? DEFAULT_PICK_KINDS;
      const max = options?.max ?? DEFAULT_PICK_MAX;
      let granted: boolean;
      try {
        const permission = await picker.requestLibraryPermission(kinds);
        if (typeof permission?.granted !== "boolean")
          throw new TypeError("Invalid picker permission");
        granted = permission.granted;
      } catch {
        throw new MediaError("picker-failed", strings.pickerFailed);
      }
      if (!granted) {
        throw new MediaError(
          "permission-denied",
          kinds.includes("video")
            ? strings.mediaPermissionRequired
            : strings.photoPermissionRequired
        );
      }
      try {
        const snapshots = snapshotPickedAssets(
          await picker.pickFromLibrary({ kinds, max }),
          max
        );
        if (!snapshots) throw new TypeError("Invalid picker asset result");
        return snapshots;
      } catch {
        throw new MediaError("picker-failed", strings.pickerFailed);
      }
    },

    async capture(options) {
      let granted: boolean;
      try {
        const permission = await picker.requestCameraPermission();
        if (typeof permission?.granted !== "boolean")
          throw new TypeError("Invalid camera permission");
        granted = permission.granted;
      } catch {
        throw new MediaError("picker-failed", strings.pickerFailed);
      }
      if (!granted) {
        throw new MediaError(
          "permission-denied",
          strings.cameraPermissionRequired
        );
      }
      try {
        const snapshots = snapshotPickedAssets(
          await picker.capture({ kind: options?.kind ?? "image" }),
          1
        );
        if (!snapshots) throw new TypeError("Invalid camera asset result");
        return snapshots;
      } catch {
        throw new MediaError("picker-failed", strings.pickerFailed);
      }
    },
  };
}
