// Lint de los paquetes de código del backend (shared, backend, tests).
// La regla que impide a la interfaz importar drivers de bases vive en The-Tito/qatok-frontend.
// El material de la actividad anterior (scripts/, presentacion/, entregables/) queda fuera.
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';
import globals from 'globals';

export default tseslint.config(
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/coverage/**',
      'scripts/**',
      'presentacion/**',
      'entregables/**',
      'verificacion/**',
      'database/graph/runner/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: { globals: { ...globals.node } },
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      'no-console': ['warn', { allow: ['warn', 'error'] }],
    },
  },
  prettier,
);
