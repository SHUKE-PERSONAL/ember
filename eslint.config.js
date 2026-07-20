import js from '@eslint/js';
import tseslint from 'typescript-eslint';

// Shared flat config for both workspaces. Kept non-type-aware on purpose:
// boring, fast, and no per-workspace project wiring. Tighten later if needed.
export default tseslint.config(
  {
    ignores: ['**/dist/**', '**/build/**', '**/node_modules/**'],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
    },
  },
);
