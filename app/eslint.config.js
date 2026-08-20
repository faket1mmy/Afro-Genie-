const expoConfig = require('eslint-config-expo/flat');

module.exports = [
  ...expoConfig,
  {
    ignores: ['dist/*', '.expo/*', 'node_modules/*', 'android/*', 'ios/*'],
  },
  {
    files: ['**/*.ts', '**/*.tsx'],
    rules: {
      // SPEC §10: TypeScript strict, no `any`.
      '@typescript-eslint/no-explicit-any': 'error',
      'no-console': ['warn', { allow: ['warn', 'error'] }],
      eqeqeq: ['error', 'always', { null: 'ignore' }],
    },
  },
  {
    files: ['**/*.test.ts', '**/*.test.tsx'],
    rules: {
      // Test files report measured numbers into the CI log on purpose.
      'no-console': 'off',
    },
  },
];
