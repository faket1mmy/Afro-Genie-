/* eslint-disable no-undef */
// A React warning in a component test almost always means a real defect — a bad
// prop type, a missing key, an update after unmount — and warnings scroll past
// unnoticed in CI. So console.error fails the test.
//
// With one exception. `usePerformanceSession` runs a requestAnimationFrame loop
// that the tests drive by hand through virtual time, and React cannot tell that
// apart from an unmanaged update; the "not wrapped in act" warning fires even
// when the test is correctly wrapping every step it controls. Failing on it
// would mean either abandoning the deterministic clock or littering the loop
// with test-only guards, and both are worse than allowing this one message.
const ALLOWED = ['not wrapped in act'];

const originalError = console.error;

beforeAll(() => {
  console.error = (...args) => {
    const message = String(args[0] ?? '');
    if (ALLOWED.some((allowed) => message.includes(allowed))) {
      return;
    }
    originalError(...args);
    throw new Error(`console.error during test: ${message}`);
  };
});

afterAll(() => {
  console.error = originalError;
});
