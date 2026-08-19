import next from 'eslint-config-next';

const config = [
  {
    ignores: [
      'node_modules/**',
      '.next/**',
      'dist/**',
      'build/**',
      'coverage/**',
      'test-results/**',
      'playwright-report/**',
      'lib/types/database.ts',
    ],
  },
  ...next,
];

export default config;
