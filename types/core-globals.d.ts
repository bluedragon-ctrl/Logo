// The only host globals the interpreter core may use (tsconfig.core.json compiles
// the core without the DOM library). Available in browsers and Node alike.
declare function setTimeout(handler: () => void, ms?: number): unknown;
declare function clearTimeout(id: unknown): void;
