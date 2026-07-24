/** @type {import('jest').Config} */
module.exports = {
  preset: 'jest-expo',
  setupFiles: ['./jest.setup.js'],
  transformIgnorePatterns: [
    'node_modules/(?!((jest-)?react-native|@react-native(-community)?)|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|react-navigation|@react-navigation/.*|standard-navigation|@sentry/react-native|native-base|react-native-svg|react-native-worklets)',
  ],
  testMatch: ['**/__tests__/**/*.test.[jt]s?(x)'],
  collectCoverageFrom: [
    'src/domain/**/*.ts',
    'src/services/**/*.ts',
    'src/store/**/*.ts',
    '!**/*.d.ts',
  ],
  clearMocks: true,
};
