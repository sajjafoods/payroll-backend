module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  testMatch: ['**/__tests__/**/*.test.ts'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
  },
  collectCoverageFrom: [
    'src/db/queries/**/*.ts',
    '!src/db/queries/**/*.test.ts',
    '!src/db/queries/**/*.manual.ts',
    '!src/db/queries/**/*.simple.ts',
  ],
  testTimeout: 10000,
  setupFilesAfterEnv: ['<rootDir>/src/db/queries/__tests__/setup.ts'],
};
