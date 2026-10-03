import base from '@raadi/config/eslint-react';
import globals from 'globals';

export default [
  ...base,
  { ignores: ['dist/**', '.expo/**', 'expo-env.d.ts'] },
  { files: ['src/**/*.{ts,tsx}'], languageOptions: { globals: { ...globals.browser } } },
  {
    // useLoad/usePaged take a dependency list like useEffect: check it where they are called.
    files: ['src/**/*.{ts,tsx}'],
    rules: {
      'react-hooks/exhaustive-deps': ['error', { additionalHooks: '^(useLoad|usePaged)$' }],
    },
  },
];
