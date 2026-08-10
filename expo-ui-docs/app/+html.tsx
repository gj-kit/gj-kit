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

  a:focus-visible {
    border-radius: 14px;
    outline: 3px solid rgba(74, 63, 224, 0.38);
    outline-offset: 3px;
  }

  a:active {
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

  @media (prefers-reduced-motion: reduce) {
    html {
      scroll-behavior: auto;
    }

    a,
    .seo-skip-link {
      transition: none;
    }
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
        <link rel="preconnect" href="https://www.npmjs.com" />

        <ScrollViewStyleReset />
        <style dangerouslySetInnerHTML={{ __html: globalStyles }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
