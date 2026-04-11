import "@testing-library/jest-dom";
import { vi } from "vitest";
import { resolve } from "path";

const srcRoot = resolve(process.cwd(), "src");

// ---------------------------------------------------------------------------
// Patch Node.js _resolveFilename so require("@/...") resolves the TypeScript
// source file.  We return a forward-slash-normalised path (matching Vitest/
// Vite's internal path format) so the mock registry lookup hits correctly.
// ---------------------------------------------------------------------------
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const _Module = require("module");
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { existsSync } = require("fs");
  const _orig = _Module._resolveFilename;
  _Module._resolveFilename = function (
    request: string,
    parent: unknown,
    isMain: boolean,
    options: unknown,
  ) {
    if (typeof request === "string" && request.startsWith("@/")) {
      const base = resolve(srcRoot, request.slice(2));
      for (const candidate of [
        base,
        `${base}.ts`,
        `${base}.tsx`,
        `${base}/index.ts`,
      ]) {
        if (existsSync(candidate)) {
          // Forward slashes to match Vitest/Vite mock-registry key format
          return candidate.replace(/\\/g, "/");
        }
      }
    }
    return _orig.call(this, request, parent, isMain, options);
  };
} catch {
  // Non-critical
}

// ---------------------------------------------------------------------------
// Sync Vitest ESM mocks into Node.js's require cache before each test so that
// require("@/lib/logger") (used in some test assertions) returns the same mock
// instance that the component under test received via ESM import.
// ---------------------------------------------------------------------------
const ALIAS_MODULES_TO_SYNC: Array<{ specifier: string; cacheKey: string }> = [
  {
    specifier: "@/lib/logger",
    cacheKey: resolve(srcRoot, "lib/logger.ts").replace(/\\/g, "/"),
  },
];

beforeEach(async () => {
  for (const { specifier, cacheKey } of ALIAS_MODULES_TO_SYNC) {
    try {
      // Dynamic import goes through Vitest's module system and returns the
      // active mock (if vi.mock was called for this specifier in the test file).
      const mod = await import(/* @vite-ignore */ specifier);
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const reqCache = (require as NodeRequire & { cache: Record<string, unknown> }).cache;
      reqCache[cacheKey] = {
        id: cacheKey,
        filename: cacheKey,
        loaded: true,
        exports: mod,
        parent: null,
        children: [],
        paths: [],
      };
    } catch {
      // Module not available or not mocked; remove stale cache entry
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const reqCache = (require as NodeRequire & { cache: Record<string, unknown> }).cache;
      delete reqCache[cacheKey];
    }
  }
});

afterEach(() => {
  for (const { cacheKey } of ALIAS_MODULES_TO_SYNC) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const reqCache = (require as NodeRequire & { cache: Record<string, unknown> }).cache;
    delete reqCache[cacheKey];
  }
});

// Mock next/navigation
vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    prefetch: vi.fn(),
    refresh: vi.fn(),
  }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/",
  useParams: () => ({}),
}));

// Mock next/font/google
vi.mock("next/font/google", () => ({
  Inter: () => ({ variable: "--font-inter", className: "inter" }),
}));

// Suppress console.error for known React test warnings
const originalError = console.error;
beforeAll(() => {
  console.error = (...args: unknown[]) => {
    if (
      typeof args[0] === "string" &&
      (args[0].includes("Warning: ReactDOM.render") ||
        args[0].includes("act(...)"))
    ) {
      return;
    }
    originalError(...args);
  };
});

afterAll(() => {
  console.error = originalError;
});
