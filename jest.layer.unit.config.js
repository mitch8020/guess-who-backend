/** @type {import('jest').Config} */
module.exports = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: 'src',
  testEnvironment: 'node',
  testMatch: [
    '<rootDir>/common/utils/*.spec.ts',
    '<rootDir>/common/guards/*.spec.ts',
    '<rootDir>/common/errors/api-exception.filter.spec.ts',
    '<rootDir>/users/users.service.spec.ts',
    '<rootDir>/chat/chat.service.spec.ts',
    '<rootDir>/images/images.service.spec.ts',
  ],
  transform: {
    '^.+\\.(t|j)s$': 'ts-jest',
  },
  collectCoverage: true,
  collectCoverageFrom: [
    'common/utils/*.ts',
    'common/guards/*.ts',
    'common/errors/api-exception.filter.ts',
    'users/users.service.ts',
    'chat/chat.service.ts',
    'images/images.service.ts',
  ],
  coverageDirectory: '../coverage/layer-unit',
  coverageReporters: ['text', 'json-summary'],
  coverageThreshold: {
    global: {
      statements: 90,
    },
  },
};

