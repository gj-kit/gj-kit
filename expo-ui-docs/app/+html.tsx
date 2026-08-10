import type { PropsWithChildren } from 'react';
import { ScrollViewStyleReset } from 'expo-router/html';

const SITE_URL = 'https://gj-kit-expo-ui.expo.app/';
const OG_IMAGE_URL = `${SITE_URL}og.png`;
const TITLE = '@gj-kit/expo-ui — 타입으로 지키는 Expo UI Kit';
const DESCRIPTION =
  '테마 토큰, 라이트·다크 모드, 타입 안전한 컴포넌트 API와 접근성 계약을 제공하는 Expo·React Native UI Kit입니다.';

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
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
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
        <meta name="robots" content="index, follow" />
        <meta name="theme-color" content="#ffffff" />

        <meta property="og:type" content="website" />
        <meta property="og:locale" content="ko_KR" />
        <meta property="og:site_name" content="@gj-kit/expo-ui" />
        <meta property="og:url" content={SITE_URL} />
        <meta property="og:title" content={TITLE} />
        <meta property="og:description" content={DESCRIPTION} />
        <meta property="og:image" content={OG_IMAGE_URL} />

        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content={TITLE} />
        <meta name="twitter:description" content={DESCRIPTION} />
        <meta name="twitter:image" content={OG_IMAGE_URL} />

        <ScrollViewStyleReset />
        <style dangerouslySetInnerHTML={{ __html: globalStyles }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
