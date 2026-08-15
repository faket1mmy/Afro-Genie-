/* eslint-disable no-undef */
// Keeps test output honest: an unhandled console.error from React usually means
// a real problem in a component test, so make it fail rather than scroll past.
const originalError = console.error;

beforeAll(() => {
  console.error = (...args) => {
    originalError(...args);
    throw new Error(`console.error during test: ${args[0]}`);
  };
});

afterAll(() => {
  console.error = originalError;
});
