import base from '@raadi/config/eslint';
import globals from 'globals';

export default [
  ...base,
  { ignores: ['dist/**', '.expo/**', 'expo-env.d.ts'] },
  { files: ['src/**/*.{ts,tsx}'], languageOptions: { globals: { ...globals.browser } } },
];
