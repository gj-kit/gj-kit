import sitemap from '@astrojs/sitemap';
import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';

export default defineConfig({
  site: 'https://gj-kit.github.io',
  base: '/gj-kit',
  trailingSlash: 'always',
  integrations: [
    sitemap(),
    starlight({
      title: { en: 'GJ Kit', ko: 'GJ Kit 문서' },
      description: 'Reusable TypeScript libraries with explicit platform and safety boundaries.',
      defaultLocale: 'root',
      locales: {
        root: { label: 'English', lang: 'en' },
        ko: { label: '한국어', lang: 'ko-KR' },
      },
      social: [
        { icon: 'github', label: 'GitHub', href: 'https://github.com/gj-kit/gj-kit' },
      ],
      customCss: ['./src/styles/custom.css'],
      sidebar: [
        {
          label: 'Overview',
          translations: { 'ko-KR': '개요' },
          items: ['index'],
        },
        {
          label: 'Packages',
          translations: { 'ko-KR': '패키지' },
          collapsed: true,
          items: [{ autogenerate: { directory: 'packages', collapsed: true } }],
        },
        {
          label: 'Solutions',
          translations: { 'ko-KR': '솔루션' },
          collapsed: true,
          items: [{ autogenerate: { directory: 'solutions' } }],
        },
        {
          label: 'API reference',
          translations: { 'ko-KR': 'API 레퍼런스' },
          collapsed: true,
          items: [{ autogenerate: { directory: 'api', collapsed: true } }],
        },
      ],
    }),
  ],
});
