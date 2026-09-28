import { NextRequest, NextResponse } from "next/server";
import type { NextApiHandler } from "./routes";
import { ensureBackendReady } from "./bootstrap";
import routes from "./routes";

type CookieMutation = {
  name: string;
  value: string;
  options: Record<string, unknown>;
};

type LegacyResponse = {
  status: (code: number) => LegacyResponse;
  json: (value: unknown) => LegacyResponse;
  cookie: (name: string, value: string, options?: Record<string, unknown>) => LegacyResponse;
  clearCookie: (name: string, options?: Record<string, unknown>) => LegacyResponse;
  statusCode: number;
  payload?: unknown;
  finished: boolean;
  cookies: CookieMutation[];
};

const windows = new Map<string, { startedAt: number; count: number }>();
const API_WINDOW_MS = 15 * 60 * 1000;
const API_LIMIT = 100;
const EMAIL_WINDOW_MS = 60 * 60 * 1000;
const EMAIL_LIMIT = 5;

function allowRequest(key: string, limit: number, windowMs: number) {
  const now = Date.now();
  const current = windows.get(key);
  if (!current || now - current.startedAt >= windowMs) {
    windows.set(key, { startedAt: now, count: 1 });
    return true;
  }
  current.count += 1;
  return current.count <= limit;
}

function responseFacade(): LegacyResponse {
  const response: LegacyResponse = {
    statusCode: 200,
    finished: false,
    cookies: [],
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(value) {
      this.payload = value;
      this.finished = true;
      return this;
    },
    cookie(name, value, options = {}) {
      this.cookies.push({ name, value, options });
      return this;
    },
    clearCookie(name, options = {}) {
      this.cookies.push({ name, value: "", options: { ...options, expires: new Date(0), maxAge: 0 } });
      return this;
    }
  };
  return response;
}

async function executeStack(stack: NextApiHandler[], req: Record<string, any>, res: LegacyResponse) {
  for (const handler of stack) {
    let continueStack = false;
    await new Promise<void>((resolve, reject) => {
      let settled = false;
      const next = (error?: unknown) => {
        if (settled) return;
        settled = true;
        if (error) reject(error);
        else {
          continueStack = true;
          resolve();
        }
      };

      Promise.resolve(handler(req, res, next)).then(() => {
        if (res.finished && !settled) {
          settled = true;
          resolve();
        } else if (!settled && handler.length < 3) {
          settled = true;
          resolve();
        }
      }).catch(reject);
    });
    if (res.finished || !continueStack) break;
  }
}

function toNextResponse(res: LegacyResponse) {
  const response = NextResponse.json(res.payload ?? { success: false, message: "Request failed" }, { status: res.statusCode });
  for (const cookie of res.cookies) {
    response.cookies.set(cookie.name, cookie.value, cookie.options as Parameters<typeof response.cookies.set>[2]);
  }
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  return response;
}

export async function dispatch(request: NextRequest, segments: string[]) {
  try {
    await ensureBackendReady();
    const pathname = segments.length ? `/api/${segments.join("/")}` : "/api";
    const route = routes.find((candidate) => candidate.method === request.method && candidate.pattern.test(pathname));
    if (!route) return NextResponse.json({ success: false, message: "Route not found" }, { status: 404 });

    const forwardedFor = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
    const ip = forwardedFor || request.headers.get("x-real-ip") || "unknown";
    const limiter = pathname.startsWith("/api/auth/verify-email") || pathname.startsWith("/api/auth/resend-verification")
      ? allowRequest(`${ip}:email`, EMAIL_LIMIT, EMAIL_WINDOW_MS)
      : allowRequest(`${ip}:api`, API_LIMIT, API_WINDOW_MS);
    if (!limiter) return NextResponse.json({ success: false, message: "Too many requests. Please try again later." }, { status: 429 });

    let body: Record<string, unknown> = {};
    if (!["GET", "HEAD"].includes(request.method)) {
      try {
        body = await request.json();
      } catch {
        body = {};
      }
    }
    const url = new URL(request.url);
    const cookies = Object.fromEntries(request.cookies.getAll().map(({ name, value }) => [name, value]));
    const req: Record<string, any> = {
      body,
      query: Object.fromEntries(url.searchParams.entries()),
      cookies,
      headers: Object.fromEntries(request.headers.entries()),
      originalUrl: `${url.pathname}${url.search}`,
      ip,
      get: (name: string) => request.headers.get(name) ?? undefined
    };
    const res = responseFacade();
    await executeStack([...route.middleware, route.controller], req, res);
    return toNextResponse(res);
  } catch (error) {
    console.error("Next API route error:", error);
    return NextResponse.json({ success: false, message: "Internal server error" }, { status: 500 });
  }
}
