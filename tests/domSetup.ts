import { JSDOM } from "jsdom";
const dom = new JSDOM("<!doctype html><html><body></body></html>", {
  url: "http://localhost",
  pretendToBeVisual: true,
});
for (const key of [
  "window",
  "document",
  "navigator",
  "HTMLElement",
  "Element",
  "SVGElement",
  "Node",
  "Event",
  "MouseEvent",
  "KeyboardEvent",
  "MutationObserver",
  "localStorage",
])
  Object.defineProperty(globalThis, key, {
    configurable: true,
    value: (dom.window as any)[key],
  });
Object.assign(globalThis, {
  getComputedStyle: dom.window.getComputedStyle,
  requestAnimationFrame: dom.window.requestAnimationFrame.bind(dom.window),
  cancelAnimationFrame: dom.window.cancelAnimationFrame.bind(dom.window),
  IS_REACT_ACT_ENVIRONMENT: true,
});
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
Object.assign(globalThis, { ResizeObserver: ResizeObserverStub });
Object.assign(dom.window, {
  ResizeObserver: ResizeObserverStub,
  matchMedia: () => ({ matches: false, addListener() {}, removeListener() {} }),
});
HTMLElement.prototype.scrollIntoView = function () {};

// jsdom has no layout engine; Recharts reports expected zero-size containers.
const warn = console.warn;
console.warn = (...args) => {
  if (typeof args[0] === "string" && args[0].startsWith("The width(")) return;
  warn(...args);
};
