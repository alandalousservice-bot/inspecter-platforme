import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['**/dist/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['packages/api/test/**/*.mjs'],
    languageOptions: {
      globals: { fetch: 'readonly' },
    },
  },
);
