// @/lib/clientIp.test.ts
//
// Regression tests for M-4. getClientIp() used to return the LEFTMOST
// X-Forwarded-For entry, which is whatever the caller typed — so the login
// throttle (10 attempts / 15 min, app/api/v1/auth/login/route.ts) could be
// bypassed indefinitely by varying a header value.
//
// X-Forwarded-For grows left-to-right, each proxy appending the peer it
// received from, so with `n` trusted proxies the real client is the nth
// entry from the right. The hop count is explicit configuration: the repo
// carries no deployment manifest and PRD §2 permits either Vercel or
// self-hosted Node, so there is nothing to infer it from.

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/mongodb", () => ({
  connectDB: vi.fn().mockResolvedValue(undefined),
}));

// rateLimit.ts declares its own counter collection at module scope; the
// schema machinery is irrelevant to IP parsing, so it is stubbed out.
vi.mock("mongoose", () => {
  class Schema {
    index() {
      return this;
    }
  }
  const model = () => ({});
  return { Schema, model, models: {}, default: { Schema, model, models: {} } };
});

const { getClientIp, getTrustedProxyHopCount } = await import(
  "@/lib/rateLimit"
);

function requestWith(headers: Record<string, string>) {
  return { headers: new Headers(headers) } as Parameters<typeof getClientIp>[0];
}

const ORIGINAL_ENV = { ...process.env };

beforeEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

describe("getTrustedProxyHopCount", () => {
  it("defaults to 0 outside production", () => {
    delete process.env.TRUSTED_PROXY_HOP_COUNT;
    process.env.APPLICATION_ENVIRONMENT = "development";
    expect(getTrustedProxyHopCount()).toBe(0);
  });

  it("refuses to guess in production", () => {
    delete process.env.TRUSTED_PROXY_HOP_COUNT;
    process.env.APPLICATION_ENVIRONMENT = "production";
    expect(() => getTrustedProxyHopCount()).toThrow(
      /TRUSTED_PROXY_HOP_COUNT must be set in production/,
    );
  });

  it("rejects a non-integer or negative value", () => {
    process.env.APPLICATION_ENVIRONMENT = "development";
    for (const bad of ["abc", "-1", "1.5"]) {
      process.env.TRUSTED_PROXY_HOP_COUNT = bad;
      expect(() => getTrustedProxyHopCount()).toThrow(/Invalid/);
    }
  });
});

describe("getClientIp", () => {
  beforeEach(() => {
    process.env.APPLICATION_ENVIRONMENT = "development";
  });

  it("ignores X-Forwarded-For entirely with zero trusted hops", () => {
    process.env.TRUSTED_PROXY_HOP_COUNT = "0";

    // The core M-4 defect: this value used to become the rate-limit bucket.
    expect(getClientIp(requestWith({ "x-forwarded-for": "1.2.3.4" }))).not.toBe(
      "1.2.3.4",
    );
  });

  it("also ignores X-Real-IP with zero trusted hops", () => {
    process.env.TRUSTED_PROXY_HOP_COUNT = "0";
    expect(getClientIp(requestWith({ "x-real-ip": "9.9.9.9" }))).not.toBe(
      "9.9.9.9",
    );
  });

  it("gives every caller the same bucket when it cannot identify them", () => {
    process.env.TRUSTED_PROXY_HOP_COUNT = "0";

    const a = getClientIp(requestWith({ "x-forwarded-for": "1.1.1.1" }));
    const b = getClientIp(requestWith({ "x-forwarded-for": "2.2.2.2" }));

    // Shared bucket is the safe degradation: throttling still applies.
    expect(a).toBe(b);
  });

  it("takes the rightmost entry behind one trusted proxy", () => {
    process.env.TRUSTED_PROXY_HOP_COUNT = "1";

    // The attacker prepends junk; the trusted proxy appends the truth.
    expect(
      getClientIp(requestWith({ "x-forwarded-for": "6.6.6.6, 203.0.113.7" })),
    ).toBe("203.0.113.7");
  });

  it("counts hops from the right behind two trusted proxies", () => {
    process.env.TRUSTED_PROXY_HOP_COUNT = "2";

    expect(
      getClientIp(
        requestWith({
          "x-forwarded-for": "6.6.6.6, 203.0.113.7, 10.0.0.1",
        }),
      ),
    ).toBe("203.0.113.7");
  });

  it("tolerates whitespace and empty entries in the chain", () => {
    process.env.TRUSTED_PROXY_HOP_COUNT = "1";

    expect(
      getClientIp(
        requestWith({ "x-forwarded-for": " 6.6.6.6 , , 203.0.113.7 " }),
      ),
    ).toBe("203.0.113.7");
  });

  it("fails closed when the chain is shorter than the configured depth", () => {
    process.env.TRUSTED_PROXY_HOP_COUNT = "3";

    const ip = getClientIp(requestWith({ "x-forwarded-for": "203.0.113.7" }));

    // Must not fall back to a caller-supplied entry.
    expect(ip).not.toBe("203.0.113.7");
    expect(ip).toBe("unknown");
  });

  it("fails closed when the header is missing but a proxy is expected", () => {
    process.env.TRUSTED_PROXY_HOP_COUNT = "1";
    expect(getClientIp(requestWith({ "x-real-ip": "9.9.9.9" }))).toBe(
      "unknown",
    );
  });
});
