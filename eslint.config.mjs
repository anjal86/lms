import { defineConfig, globalIgnores } from 'eslint/config';
import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTs from 'eslint-config-next/typescript';

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  globalIgnores([
    '.agents/**',
    '.next/**',
    'out/**',
    'build/**',
    'coverage/**',
    'next-env.d.ts',
  ]),
  {
    files: ['src/**/*.{ts,tsx}'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      'react/no-unescaped-entities': 'off',
      'react-hooks/purity': 'warn',
      'react-hooks/set-state-in-effect': 'warn',
      '@next/next/no-img-element': 'warn',
    },
  },
  {
    // StableInbox keeps tenant-scoped runtime caches in refs so they survive route
    // remounts without becoming render state. Reads/writes happen from effects and
    // event callbacks; the scope pointer is intentionally refreshed during render.
    files: ['src/components/inbox/StableInbox.tsx'],
    rules: {
      'react-hooks/refs': 'warn',
    },
  },
]);