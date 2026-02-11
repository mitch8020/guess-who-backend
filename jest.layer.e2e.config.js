/** @type {import('jest').Config} */
module.exports = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: '.',
  testEnvironment: 'node',
  testRegex: '.e2e-spec.ts$',
  transform: {
    '^.+\\.(t|j)s$': 'ts-jest',
  },
  collectCoverage: true,
  collectCoverageFrom: ['src/app.controller.ts'],
  coverageDirectory: './coverage/layer-e2e',
  coverageReporters: ['text', 'json-summary'],
  coverageThreshold: {
    global: {
      statements: 90,
    },
  },
};

