import { Stack } from 'expo-router';
import { LocaleProvider } from '../src/locale';

export default function Layout() {
  // 로케일은 라우트 전체가 공유한다. 페이지를 옮겨도 선택이 유지된다.
  return (
    <LocaleProvider>
      <Stack screenOptions={{ headerShown: false }} />
    </LocaleProvider>
  );
}
