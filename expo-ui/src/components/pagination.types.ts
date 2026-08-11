/**
 * Pagination public contracts.
 *
 * Pagination is controlled and intentionally separates numbered collections
 * from opaque cursor navigation. Applications continue to own fetching and
 * the current page/cursor; this component owns accessible navigation requests.
 */
import type { StyleProp, TextStyle, ViewStyle } from "react-native";
import type { CommonProps } from "./internal";

export type PaginationMode = "numbered" | "cursor";
export type PaginationDirection = "ltr" | "rtl";
export type PaginationSize = "sm" | "md";
export type PaginationPresentation = "auto" | "full" | "compact";
export type PaginationCountMode = "items" | "pages";
export type PaginationBoundaryCount = 0 | 1 | 2;
export type PaginationSiblingCount = 0 | 1 | 2;
export type PaginationNavigateDirection = "previous" | "next";
export type PaginationPageChangeReason =
  | "page-press"
  | "previous-press"
  | "next-press";

export interface PaginationPageLabelDetails {
  readonly page: number;
  readonly pageCount: number;
  readonly current: boolean;
}

interface PaginationNumberedPageChangeDetails {
  readonly mode: "numbered";
  readonly page: number;
  readonly previousPage: number;
  readonly pageCount: number;
  readonly reason: PaginationPageChangeReason;
  readonly originalEvent?: unknown;
}

export interface PaginationItemsPageChangeDetails
  extends PaginationNumberedPageChangeDetails {
  readonly countMode: "items";
  readonly totalItemCount: number;
  readonly pageSize: number;
  /** Zero-based inclusive item offset for the requested page. */
  readonly offset: number;
  /** Zero-based exclusive item offset, clamped to totalItemCount. */
  readonly endOffsetExclusive: number;
  readonly visibleItemCount: number;
}

export interface PaginationPagesPageChangeDetails
  extends PaginationNumberedPageChangeDetails {
  readonly countMode: "pages";
}

export interface PaginationNavigateDetails {
  readonly mode: "cursor";
  readonly direction: PaginationNavigateDirection;
  readonly hasPreviousPage: boolean;
  readonly hasNextPage: boolean;
  readonly originalEvent?: unknown;
}

export type PaginationBaseProps = Omit<CommonProps, "unstyled"> & {
  /** Accessible name for the complete pagination navigation region. */
  readonly accessibilityLabel: string;
  readonly direction?: PaginationDirection | undefined;
  readonly size?: PaginationSize | undefined;
  readonly disabled?: boolean | undefined;
  readonly busy?: boolean | undefined;
  /** Visible control label. Falls back to UiProvider strings. */
  readonly previousLabel?: string | undefined;
  /** Visible control label. Falls back to UiProvider strings. */
  readonly nextLabel?: string | undefined;
  readonly controlStyle?: StyleProp<ViewStyle> | undefined;
  readonly controlClassName?: string | undefined;
  readonly controlLabelStyle?: StyleProp<TextStyle> | undefined;
  readonly controlLabelClassName?: string | undefined;
  readonly statusStyle?: StyleProp<TextStyle> | undefined;
  readonly statusClassName?: string | undefined;
  readonly unstyled?: never;
};

type PaginationNumberedCommonProps = {
  readonly mode: "numbered";
  /** Controlled, one-based page. When pageCount is zero, the sentinel is 1. */
  readonly page: number;
  readonly presentation?: PaginationPresentation | undefined;
  readonly boundaryCount?: PaginationBoundaryCount | undefined;
  readonly siblingCount?: PaginationSiblingCount | undefined;
  readonly getPageAccessibilityLabel?:
    | ((details: PaginationPageLabelDetails) => string)
    | undefined;
  /**
   * Optional visible status override. Page totals use `page / pageCount`;
   * item totals use the one-based visible item range and total item count.
   */
  readonly statusLabel?: string | undefined;
  readonly hasPreviousPage?: never;
  readonly hasNextPage?: never;
  readonly onNavigate?: never;
};

export type PaginationNumberedItemsProps = PaginationBaseProps &
  PaginationNumberedCommonProps & {
    readonly countMode: "items";
    readonly totalItemCount: number;
    readonly pageSize: number;
    readonly pageCount?: never;
    readonly onPageChange: (
      page: number,
      details: PaginationItemsPageChangeDetails
    ) => void;
  };

export type PaginationNumberedPagesProps = PaginationBaseProps &
  PaginationNumberedCommonProps & {
    readonly countMode: "pages";
    readonly pageCount: number;
    readonly totalItemCount?: never;
    readonly pageSize?: never;
    readonly onPageChange: (
      page: number,
      details: PaginationPagesPageChangeDetails
    ) => void;
  };

export type PaginationCursorProps = PaginationBaseProps & {
  readonly mode: "cursor";
  /** Required because a cursor does not expose a numeric position. */
  readonly statusLabel: string;
  readonly hasPreviousPage: boolean;
  readonly hasNextPage: boolean;
  readonly onNavigate: (
    direction: PaginationNavigateDirection,
    details: PaginationNavigateDetails
  ) => void;
  readonly page?: never;
  readonly presentation?: never;
  readonly boundaryCount?: never;
  readonly siblingCount?: never;
  readonly getPageAccessibilityLabel?: never;
  readonly countMode?: never;
  readonly totalItemCount?: never;
  readonly pageSize?: never;
  readonly pageCount?: never;
  readonly onPageChange?: never;
};

export type PaginationProps =
  | PaginationNumberedItemsProps
  | PaginationNumberedPagesProps
  | PaginationCursorProps;
