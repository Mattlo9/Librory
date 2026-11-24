declare module 'bun:test' {
  export function describe(label: string, fn: () => void): void;
  export function test(label: string, fn: () => void | Promise<void>): void;

  interface Matchers<T> {
    toBe(expected: T): void;
    toEqual(expected: unknown): void;
    toBeUndefined(): void;
    toBeInstanceOf(ctor: new (...args: never[]) => unknown): void;
    toContain(substr: string): void;
    toThrow(pattern?: string | RegExp): void;
    toBeLessThan(expected: number): void;
    readonly not: Matchers<T>;
  }

  export function expect<T>(actual: T): Matchers<T>;
}
