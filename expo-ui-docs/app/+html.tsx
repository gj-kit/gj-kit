import type { PropsWithChildren } from 'react';
import { ScrollViewStyleReset } from 'expo-router/html';

const globalStyles = `
  *, *::before, *::after {
    box-sizing: border-box;
  }

  html {
    scroll-behavior: smooth;
    -webkit-text-size-adjust: 100%;
    font-family: Pretendard, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto,
      "Noto Sans KR", "Apple SD Gothic Neo", "Malgun Gothic", sans-serif;
  }

  body,
  button,
  input,
  select,
  textarea {
    font-family: inherit;
  }

  body {
    margin: 0;
    background: #f8f8fc;
    overflow-x: hidden;
    overflow-y: auto;
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
  }

  a {
    text-decoration: none;
    transition: opacity 140ms ease;
  }

  .seo-skip-link {
    position: fixed;
    z-index: 1000;
    top: 12px;
    left: 12px;
    padding: 10px 14px;
    border-radius: 10px;
    color: #ffffff;
    background: #4a3fe0;
    font-size: 13px;
    font-weight: 800;
    transform: translateY(-160%);
    transition: transform 140ms ease;
  }

  .seo-skip-link:focus {
    transform: translateY(0);
  }

  .seo-sticky-header {
    position: sticky;
    z-index: 50;
    top: 0;
  }

  /*
   * react-native-web의 Pressable은 outline: none을 인라인으로 깔기 때문에
   * <button>으로 렌더되는 필터·토글·리셋 컨트롤이 키보드 포커스 시 아무 표시도
   * 남기지 않았다(WCAG 2.4.7). a와 동일한 링을 button·input·[tabindex]까지 넓힌다.
   */
  a:focus-visible,
  button:focus-visible,
  [role='button']:focus-visible,
  [tabindex]:focus-visible,
  input:focus-visible,
  summary:focus-visible {
    border-radius: 14px;
    outline: 3px solid var(--gj-focus-ring, rgba(74, 63, 224, 0.38)) !important;
    outline-offset: 3px;
  }

  a:active,
  button:active {
    opacity: 0.72;
  }

  .seo-component-grid a,
  .seo-link-grid a {
    transition: opacity 140ms ease, transform 160ms ease, box-shadow 160ms ease;
  }

  .seo-component-grid a:hover,
  .seo-link-grid a:hover {
    transform: translateY(-2px);
    box-shadow: 0 14px 34px rgba(20, 21, 40, 0.1);
  }

  .seo-link-grid,
  .seo-component-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
    gap: 16px;
    width: 100%;
  }

  .seo-directory-layout {
    display: grid;
    grid-template-columns: 216px minmax(0, 1fr);
    gap: 32px;
    align-items: start;
    width: 100%;
  }

  .seo-directory-hero {
    display: grid;
    grid-template-columns: minmax(0, 1.45fr) minmax(300px, 0.75fr);
    gap: 32px;
    align-items: center;
  }

  .seo-directory-hero h1 {
    word-break: keep-all;
  }

  @media (min-width: 901px) and (max-width: 1100px) {
    .seo-directory-hero h1 {
      font-size: 40px !important;
      line-height: 48px !important;
    }
  }

  .seo-proof-grid {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 10px;
  }

  .seo-category-options {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .seo-category-rail {
    position: sticky;
    top: 96px;
  }

  #component-search-input:focus-visible {
    outline: 3px solid rgba(74, 63, 224, 0.28) !important;
    outline-offset: 1px;
  }

  @media (max-width: 900px) {
    .seo-directory-layout {
      grid-template-columns: minmax(0, 1fr);
      gap: 22px;
    }

    .seo-category-rail {
      position: static;
    }

    .seo-directory-hero {
      grid-template-columns: minmax(0, 1fr);
      gap: 18px;
    }

    .seo-category-options {
      flex-direction: row;
      flex-wrap: wrap;
      gap: 8px;
    }
  }

  @media (max-width: 700px) {
    .seo-proof-grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }

  @media (max-width: 520px) {
    .seo-link-grid,
    .seo-component-grid {
      grid-template-columns: minmax(0, 1fr);
    }
  }

  /*
   * 카드 호버 규칙(.seo-component-grid a)은 명시도 0,1,1이라 a 선택자만 쓰던
   * 이전 감소-모션 블록(0,0,1)에게 이겼다. 미디어 쿼리는 명시도를 더해 주지
   * 않으므로 카탈로그 49장의 lift 애니메이션이 그대로 남았다. 전역 리셋으로 바꾼다.
   */
  @media (prefers-reduced-motion: reduce) {
    *,
    *::before,
    *::after {
      animation-duration: 0.01ms !important;
      animation-iteration-count: 1 !important;
      scroll-behavior: auto !important;
      transition-duration: 0.01ms !important;
    }

    .seo-component-grid a:hover,
    .seo-link-grid a:hover {
      box-shadow: none;
      transform: none;
    }
  }

  /* 긴 한글 제목이 음절 단위로 끊기지 않게 한다. keep-all은 한 선택자에만 있었다. */
  h1,
  h2,
  h3,
  .seo-directory-hero h1 {
    word-break: keep-all;
  }

  /* skip link가 실제로 포커스를 옮기도록 main을 프로그래매틱 포커스 대상으로 둔다. */
  main[id^='main-content'] {
    scroll-margin-top: 88px;
  }

  main:focus {
    outline: none;
  }

  ::selection {
    color: #171526;
    background: rgba(79, 70, 229, 0.22);
  }
`;

export default function Html({ children }: PropsWithChildren) {
  return (
    <html lang="ko">
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1, shrink-to-fit=no"
        />
        <meta name="theme-color" content="#ffffff" />
        <meta name="color-scheme" content="light dark" />
        <meta name="format-detection" content="telephone=no" />
        <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
        <link rel="manifest" href="/site.webmanifest" />

        <ScrollViewStyleReset />
        <style dangerouslySetInnerHTML={{ __html: globalStyles }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
