import js from '@eslint/js';
import ts from 'typescript-eslint';
export default ts.config(js.configs.recommended, ...ts.configs.recommended, {
  languageOptions: { globals: { console: 'readonly', process: 'readonly', Buffer: 'readonly', URL: 'readonly', document: 'readonly', window: 'readonly', HTMLCanvasElement: 'readonly' } },
  rules: { '@typescript-eslint/no-explicit-any': 'off' },
});
