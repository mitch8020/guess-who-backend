/** @type {import('jest').Config} */
module.exports = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: 'src',
  testEnvironment: 'node',
  testMatch: [
    '<rootDir>/realtime/realtime.service.spec.ts',
    '<rootDir>/realtime/realtime.gateway.spec.ts',
  ],
  transform: {
    '^.+\\.(t|j)s$': 'ts-jest',
  },
  collectCoverage: true,
  collectCoverageFrom: [
    'realtime/realtime.service.ts',
    'realtime/realtime.gateway.ts',
  ],
  coverageDirectory: '../coverage/layer-component',
  coverageReporters: ['text', 'json-summary'],
  coverageThreshold: {
    global: {
      statements: 90,
    },
  },
};

