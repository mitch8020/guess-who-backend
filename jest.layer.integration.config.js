/** @type {import('jest').Config} */
module.exports = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: 'src',
  testEnvironment: 'node',
  testMatch: [
    '<rootDir>/app.controller.spec.ts',
    '<rootDir>/auth/auth.controller.spec.ts',
    '<rootDir>/chat/chat.controller.spec.ts',
    '<rootDir>/images/images.controller.spec.ts',
    '<rootDir>/invites/invites.controller.spec.ts',
    '<rootDir>/matches/matches.controller.spec.ts',
    '<rootDir>/rooms/rooms.controller.spec.ts',
  ],
  transform: {
    '^.+\\.(t|j)s$': 'ts-jest',
  },
  collectCoverage: true,
  collectCoverageFrom: [
    'app.controller.ts',
    'auth/auth.controller.ts',
    'chat/chat.controller.ts',
    'images/images.controller.ts',
    'invites/invites.controller.ts',
    'matches/matches.controller.ts',
    'rooms/rooms.controller.ts',
  ],
  coverageDirectory: '../coverage/layer-integration',
  coverageReporters: ['text', 'json-summary'],
  coverageThreshold: {
    global: {
      statements: 90,
    },
  },
};

