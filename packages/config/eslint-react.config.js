// Shared ESLint flat config for React apps (web and mobile): the base config plus the Rules of
// Hooks. A hook after an early return once slipped through review in the mobile app.
import reactHooks from 'eslint-plugin-react-hooks';
import base from './eslint.config.js';

export default [
  ...base,
  {
    files: ['**/*.{ts,tsx}'],
    plugins: { 'react-hooks': reactHooks },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'error',
    },
  },
];
