/**
 * (internal) Raw DOM hosts for the web builds.
 *
 * A few web components need a semantic HTML element React Native Web cannot
 * emit (`table`, `dl`). They create it here through a narrow `createElement`
 * boundary: public types and the native graph never see DOM types or APIs
 * (design doc §11), and every RN style reaching a raw host is translated
 * deliberately instead of leaking RN-only shorthands as invalid CSS.
 */
import { createElement } from "react";
import type { ReactElement, ReactNode } from "react";
import { StyleSheet } from "react-native";

export type RawStyle = Record<string, unknown>;
export type RawProps = Record<string, unknown>;

/** src intentionally has no DOM type dependency. Keep raw-host access narrow. */
export function rawElement(
  tag: string,
  props: RawProps | null,
  ...children: ReactNode[]
): ReactElement {
  return createElement(
    tag as never,
    props as never,
    ...children
  ) as ReactElement;
}

const RAW_STYLE_ALIASES: Readonly<Record<string, string>> = {
  borderBottomEndRadius: "borderEndEndRadius",
  borderBottomStartRadius: "borderEndStartRadius",
  borderEndColor: "borderInlineEndColor",
  borderEndWidth: "borderInlineEndWidth",
  borderStartColor: "borderInlineStartColor",
  borderStartWidth: "borderInlineStartWidth",
  borderTopEndRadius: "borderStartEndRadius",
  borderTopStartRadius: "borderStartStartRadius",
  end: "insetInlineEnd",
  marginEnd: "marginInlineEnd",
  marginStart: "marginInlineStart",
  paddingEnd: "paddingInlineEnd",
  paddingStart: "paddingInlineStart",
  start: "insetInlineStart",
};

const RAW_AXIS_STYLE_EXPANSIONS: Readonly<Record<string, readonly string[]>> = {
  marginHorizontal: ["marginLeft", "marginRight"],
  marginVertical: ["marginTop", "marginBottom"],
  paddingHorizontal: ["paddingLeft", "paddingRight"],
  paddingVertical: ["paddingTop", "paddingBottom"],
};

/**
 * RN numbers are density-independent pixels. React DOM normally adds `px` to
 * numeric dimensions, but treats a few CSS properties (notably lineHeight) as
 * unitless. Serializing every RN length here keeps raw semantic hosts faithful
 * to the RN style contract and avoids a theme lineHeight of 24 becoming 24x.
 */
const RAW_LENGTH_PROPERTIES = new Set([
  "borderBottomLeftRadius",
  "borderBottomRightRadius",
  "borderBottomWidth",
  "borderEndEndRadius",
  "borderEndStartRadius",
  "borderInlineEndWidth",
  "borderInlineStartWidth",
  "borderLeftWidth",
  "borderRadius",
  "borderRightWidth",
  "borderStartEndRadius",
  "borderStartStartRadius",
  "borderTopLeftRadius",
  "borderTopRightRadius",
  "borderTopWidth",
  "borderWidth",
  "bottom",
  "columnGap",
  "flexBasis",
  "fontSize",
  "gap",
  "height",
  "inset",
  "insetBlock",
  "insetBlockEnd",
  "insetBlockStart",
  "insetInline",
  "insetInlineEnd",
  "insetInlineStart",
  "left",
  "letterSpacing",
  "lineHeight",
  "margin",
  "marginBlock",
  "marginBlockEnd",
  "marginBlockStart",
  "marginBottom",
  "marginInline",
  "marginInlineEnd",
  "marginInlineStart",
  "marginLeft",
  "marginRight",
  "marginTop",
  "maxHeight",
  "maxWidth",
  "minHeight",
  "minWidth",
  "outlineOffset",
  "outlineWidth",
  "padding",
  "paddingBlock",
  "paddingBlockEnd",
  "paddingBlockStart",
  "paddingBottom",
  "paddingInline",
  "paddingInlineEnd",
  "paddingInlineStart",
  "paddingLeft",
  "paddingRight",
  "paddingTop",
  "right",
  "rowGap",
  "top",
  "width",
]);

/** CSS-compatible RN properties accepted by raw table descendants. */
const RAW_DIRECT_PROPERTIES = new Set([
  "alignContent",
  "alignItems",
  "alignSelf",
  "aspectRatio",
  "backfaceVisibility",
  "backgroundColor",
  "borderBlockColor",
  "borderBlockEndColor",
  "borderBlockStartColor",
  "borderBottomColor",
  "borderColor",
  "borderInlineEndColor",
  "borderInlineStartColor",
  "borderLeftColor",
  "borderRightColor",
  "borderStyle",
  "borderTopColor",
  "boxSizing",
  "color",
  "cursor",
  "direction",
  "display",
  "flex",
  "flexDirection",
  "flexGrow",
  "flexShrink",
  "flexWrap",
  "fontFamily",
  "fontStyle",
  "isolation",
  "justifyContent",
  "mixBlendMode",
  "opacity",
  "overflow",
  "position",
  "textDecorationColor",
  "textDecorationLine",
  "textDecorationStyle",
  "textTransform",
  "userSelect",
  "zIndex",
]);

function rawPrimitive(value: unknown): string | number | undefined {
  if (typeof value === "string") return value;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  return undefined;
}

function rawLength(value: unknown): string | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return `${value}px`;
  return typeof value === "string" ? value : undefined;
}

function rawFontWeight(value: unknown): string | number | undefined {
  const aliases: Readonly<Record<string, number>> = {
    black: 900,
    condensed: 400,
    condensedBold: 700,
    heavy: 800,
    light: 300,
    medium: 500,
    regular: 400,
    semibold: 600,
    thin: 100,
    ultralight: 100,
  };
  if (typeof value === "string" && value in aliases) return aliases[value];
  return rawPrimitive(value);
}

function rawTransform(style: RawStyle): string | undefined {
  if (typeof style.transform === "string") return style.transform;
  const parts: string[] = [];
  if (Array.isArray(style.transform)) {
    for (const operation of style.transform) {
      if (typeof operation !== "object" || operation === null) continue;
      const [name, value] = Object.entries(operation as RawStyle)[0] ?? [];
      if (name === undefined) continue;
      if (name === "matrix" && Array.isArray(value)) {
        const values = value.filter(
          (item): item is number =>
            typeof item === "number" && Number.isFinite(item)
        );
        if (
          values.length === value.length &&
          (values.length === 6 || values.length === 16)
        ) {
          parts.push(
            `${values.length === 16 ? "matrix3d" : "matrix"}(${values.join(
              ", "
            )})`
          );
        }
      } else if (
        name === "perspective" ||
        name === "translateX" ||
        name === "translateY"
      ) {
        const length = rawLength(value);
        if (length !== undefined) parts.push(`${name}(${length})`);
      } else if (
        name === "rotate" ||
        name === "rotateX" ||
        name === "rotateY" ||
        name === "rotateZ" ||
        name === "skewX" ||
        name === "skewY"
      ) {
        if (typeof value === "string") parts.push(`${name}(${value})`);
      } else if (name === "scale" || name === "scaleX" || name === "scaleY") {
        if (typeof value === "number" && Number.isFinite(value))
          parts.push(`${name}(${value})`);
      }
    }
  }
  if (parts.length === 0) {
    if (typeof style.rotation === "number" && Number.isFinite(style.rotation)) {
      parts.push(`rotate(${style.rotation}deg)`);
    }
    for (const name of ["scaleX", "scaleY"] as const) {
      const value = style[name];
      if (typeof value === "number" && Number.isFinite(value))
        parts.push(`${name}(${value})`);
    }
    for (const name of ["translateX", "translateY"] as const) {
      const value = rawLength(style[name]);
      if (value !== undefined) parts.push(`${name}(${value})`);
    }
    if (Array.isArray(style.transformMatrix)) {
      const values = style.transformMatrix.filter(
        (item): item is number =>
          typeof item === "number" && Number.isFinite(item)
      );
      if (
        values.length === style.transformMatrix.length &&
        (values.length === 6 || values.length === 16)
      ) {
        parts.push(
          `${values.length === 16 ? "matrix3d" : "matrix"}(${values.join(
            ", "
          )})`
        );
      }
    }
  }
  return parts.length === 0 ? undefined : parts.join(" ");
}

/**
 * Raw HTML descendants bypass React Native Web's style resolver. Translate the
 * RN style surface deliberately instead of leaking RN-only shorthands or value
 * shapes as invalid CSS declarations.
 */
export function rawDomStyle(style: unknown): RawStyle | undefined {
  const flat = StyleSheet.flatten(style as never);
  if (flat === undefined || flat === null) return undefined;
  const source = flat as unknown as RawStyle;
  const result: RawStyle = {};
  for (const [nativeName, nativeValue] of Object.entries(source)) {
    const expandedNames = RAW_AXIS_STYLE_EXPANSIONS[nativeName];
    if (expandedNames !== undefined) {
      const value = rawLength(nativeValue);
      if (value !== undefined) {
        for (const name of expandedNames) result[name] = value;
      }
      continue;
    }
    const name = RAW_STYLE_ALIASES[nativeName] ?? nativeName;
    if (RAW_LENGTH_PROPERTIES.has(name)) {
      const value = rawLength(nativeValue);
      if (value !== undefined) result[name] = value;
    } else if (RAW_DIRECT_PROPERTIES.has(name)) {
      const value = rawPrimitive(nativeValue);
      if (value !== undefined) result[name] = value;
    } else if (name === "fontWeight") {
      const value = rawFontWeight(nativeValue);
      if (value !== undefined) result.fontWeight = value;
    } else if (name === "fontVariant" && Array.isArray(nativeValue)) {
      const values = nativeValue.filter(
        (value): value is string => typeof value === "string"
      );
      if (values.length === nativeValue.length)
        result.fontVariant = values.join(" ");
    } else if (
      name === "pointerEvents" &&
      (nativeValue === "auto" || nativeValue === "none")
    ) {
      result.pointerEvents = nativeValue;
    } else if (name === "textAlign" && nativeValue !== "auto") {
      const value = rawPrimitive(nativeValue);
      if (value !== undefined) result.textAlign = value;
    } else if (name === "textAlignVertical" || name === "verticalAlign") {
      const value = nativeValue === "center" ? "middle" : nativeValue;
      if (value !== "auto" && typeof value === "string")
        result.verticalAlign = value;
    } else if (
      name === "writingDirection" &&
      (nativeValue === "ltr" || nativeValue === "rtl")
    ) {
      result.direction = nativeValue;
    } else if (
      (name === "boxShadow" ||
        name === "filter" ||
        name === "experimental_backgroundImage") &&
      typeof nativeValue === "string"
    ) {
      result[
        name === "experimental_backgroundImage" ? "backgroundImage" : name
      ] = nativeValue;
    } else if (name === "transformOrigin") {
      if (typeof nativeValue === "string") {
        result.transformOrigin = nativeValue;
      } else if (Array.isArray(nativeValue)) {
        const values = nativeValue.map((value) => rawLength(value));
        if (values.every((value): value is string => value !== undefined)) {
          result.transformOrigin = values.join(" ");
        }
      }
    }
  }
  const transform = rawTransform(source);
  if (transform !== undefined) result.transform = transform;
  return Object.keys(result).length === 0 ? undefined : result;
}
