// TanStack's serializer uses Object.hasOwn (Chrome 93+). Keep the Chrome 90
// syntax target usable without adding a polyfill library.
if (!Object.hasOwn) {
  Object.defineProperty(Object, "hasOwn", {
    configurable: true,
    writable: true,
    value: (object: object, property: PropertyKey) =>
      Object.prototype.hasOwnProperty.call(object, property),
  });
}
export {};
