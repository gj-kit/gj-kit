import { useEffect, useState } from 'react';
import { useWindowDimensions } from 'react-native';

/**
 * 정적 HTML에는 뷰포트가 없으므로 프리렌더는 폭 하나를 골라야 한다. 이 값이
 * 하이드레이션 전까지 모든 방문자가 보는 레이아웃이다.
 *
 * 데스크톱 폭(1200)으로 굽던 것을 모바일로 바꾼다. 두 방향의 실패가 대칭이
 * 아니기 때문이다. 데스크톱 트리를 390px에 밀어 넣으면 제목이 글자 단위로
 * 세로로 쌓이고 본문이 잘려 화면이 망가진다. 반대로 모바일 트리를 데스크톱
 * 폭에서 보면 단일 컬럼일 뿐 읽는 데 문제가 없고, 하이드레이션 후 2단으로
 * 넓어진다. 게다가 첫 페인트가 오래 남는 쪽은 느린 모바일 기기다.
 */
const STATIC_RENDER_WIDTH = 390;

/**
 * 정적 HTML과 브라우저의 첫 렌더가 같은 트리를 골라야 하이드레이션이 어긋나지
 * 않는다. 하이드레이션 이후에는 실제 뷰포트가 정본이 된다.
 */
export function useHydratedWindowWidth(): number {
  const { width } = useWindowDimensions();
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setHydrated(true);
  }, []);

  return hydrated ? width : STATIC_RENDER_WIDTH;
}
