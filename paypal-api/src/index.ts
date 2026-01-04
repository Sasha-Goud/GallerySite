// BUILD: 2026-01-04-C

export interface Env {
  PAYPAL_CLIENT_ID: string;
  PAYPAL_CLIENT_SECRET: string;

  // Optional: comma-separated origins override, e.g.
  // "https://sasha-goud.github.io,http://localhost:5173"
  ALLOWED_ORIGINS?: string;
}

const PAYPAL_API_BASE = "https://api-m.paypal.com"; // LIVE
// const PAYPAL_API_BASE = "https://api-m.sandbox.paypal.com"; // SANDBOX

// Default allowed browser origins (production GitHub Pages)
const DEFAULT_ALLOWED_ORIGINS = [
  "https://sasha-goud.github.io",
];

function getAllowedOrigins(env: Env): string[] {
  const raw = String(env.ALLOWED_ORIGINS || "").trim();
  if (!raw) return DEFAULT_ALLOWED_ORIGINS.slice();
  return raw
    .split(",")
    .map(s => s.trim())
    .filter(Boolean);
}

function originIsAllowed(origin: string, allowed: string[]): boolean {
  if (!origin) return false;
  return allowed.includes(origin);
}

function corsHeaders(origin: string | null, allowed: string[]): Record<string, string> {
  // For endpoints we lock, we will only ever call this after origin is validated.
  // For public endpoints, we'll still allow "*".
  if (origin && originIsAllowed(origin, allowed)) {
    return {
      "Access-Control-Allow-Origin": origin,
      "Vary": "Origin",
    };
  }
  return {
    "Access-Control-Allow-Origin": "*",
  };
}

function json(data: unknown, status = 200, extraHeaders: Record<string, string> = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
      ...extraHeaders,
    },
  });
}

function badRequest(message: string, extraHeaders: Record<string, string> = {}) {
  return json({ ok: false, error: message }, 400, extraHeaders);
}

function forbidden(message: string, extraHeaders: Record<string, string> = {}) {
  return json({ ok: false, error: message }, 403, extraHeaders);
}

async function getPayPalAccessToken(env: Env): Promise<string> {
  if (!env.PAYPAL_CLIENT_ID || !env.PAYPAL_CLIENT_SECRET) {
    throw new Error("Missing PAYPAL_CLIENT_ID or PAYPAL_CLIENT_SECRET");
  }

  const basic = btoa(`${env.PAYPAL_CLIENT_ID}:${env.PAYPAL_CLIENT_SECRET}`);

  const res = await fetch(`${PAYPAL_API_BASE}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${basic}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });

  const data = await res.json<any>();
  if (!res.ok) {
    throw new Error(`PayPal token error: ${res.status} ${JSON.stringify(data)}`);
  }

  return data.access_token;
}

async function paypalFetch(accessToken: string, path: string, init: RequestInit) {
  const res = await fetch(`${PAYPAL_API_BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
  });

  const text = await res.text();
  let data: any = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { raw: text };
  }

  return { res, data };
}

/**
 * Strict “browser-only” gate:
 * - Requires Origin header (browsers send this on CORS POSTs)
 * - Requires Sec-Fetch-* header (modern browsers send these; curl normally does not)
 * - Origin must be allowlisted
 */
function enforceBrowserOnly(request: Request, env: Env): { ok: true; origin: string; cors: Record<string, string> } | { ok: false; res: Response } {
  const allowed = getAllowedOrigins(env);
  const origin = request.headers.get("Origin") || "";
  const secFetchSite = request.headers.get("Sec-Fetch-Site");
  const secFetchMode = request.headers.get("Sec-Fetch-Mode");

  if (!origin) {
    return { ok: false, res: forbidden("Blocked: missing Origin header (browser-only endpoint).") };
  }
  if (!originIsAllowed(origin, allowed)) {
    return { ok: false, res: forbidden("Blocked: Origin not allowed.", corsHeaders(origin, allowed)) };
  }
  if (!secFetchSite && !secFetchMode) {
    // This is a practical “no curl” gate. Not perfect, but matches your requirement.
    return { ok: false, res: forbidden("Blocked: missing browser fetch metadata (Sec-Fetch-*).", corsHeaders(origin, allowed)) };
  }

  return { ok: true, origin, cors: corsHeaders(origin, allowed) };
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const allowed = getAllowedOrigins(env);
    const reqOrigin = request.headers.get("Origin");

    // CORS preflight
    if (request.method === "OPTIONS") {
      // If an Origin is present, only allow preflight from allowlisted origins
      if (reqOrigin) {
        if (!originIsAllowed(reqOrigin, allowed)) {
          return forbidden("Blocked: Origin not allowed.", corsHeaders(reqOrigin, allowed));
        }
        return new Response(null, {
          status: 204,
          headers: {
            ...corsHeaders(reqOrigin, allowed),
            "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type, Authorization",
            "Access-Control-Max-Age": "86400",
          },
        });
      }

      // No Origin => likely not a browser preflight; just no-op.
      return new Response(null, { status: 204 });
    }

    // Public endpoints
    if (request.method === "GET" && url.pathname === "/") {
      return json({ ok: true, message: "Worker is running. Try GET /health" }, 200, corsHeaders(reqOrigin, allowed));
    }

    if (request.method === "GET" && url.pathname === "/health") {
      return json({ ok: true, service: "paypal-api", ts: new Date().toISOString() }, 200, corsHeaders(reqOrigin, allowed));
    }

    // Client ID is public; still fine to expose
    if (request.method === "GET" && url.pathname === "/config") {
      return json(
        {
          ok: true,
          env: "live",
          paypalClientId: env.PAYPAL_CLIENT_ID ? env.PAYPAL_CLIENT_ID : null,
        },
        200,
        corsHeaders(reqOrigin, allowed)
      );
    }

    // POST /create-order  body: { amount: "10.00", currency?: "GBP" }
    if (request.method === "POST" && url.pathname === "/create-order") {
      const gate = enforceBrowserOnly(request, env);
      if (!gate.ok) return gate.res;

      const body = await request.json<any>().catch(() => null);
      if (!body) return badRequest("Expected JSON body.", gate.cors);

      const amount = String(body.amount ?? "").trim();
      const currency = String(body.currency ?? "GBP").trim().toUpperCase();

      if (!amount || !/^\d+(\.\d{2})$/.test(amount)) {
        return badRequest('amount must be a string like "10.00"', gate.cors);
      }
      if (!/^[A-Z]{3}$/.test(currency)) {
        return badRequest('currency must be a 3-letter code like "GBP"', gate.cors);
      }

      try {
        const token = await getPayPalAccessToken(env);

        const payload = {
          intent: "CAPTURE",
          purchase_units: [
            {
              amount: {
                currency_code: currency,
                value: amount,
              },
            },
          ],
        };

        const { res, data } = await paypalFetch(token, "/v2/checkout/orders", {
          method: "POST",
          body: JSON.stringify(payload),
        });

        if (!res.ok) {
          return json({ ok: false, paypalError: data }, res.status, gate.cors);
        }

        return json(
          {
            ok: true,
            id: data.id,
            status: data.status,
            links: data.links,
          },
          200,
          gate.cors
        );
      } catch (e: any) {
        return json({ ok: false, error: e?.message ?? String(e) }, 500, gate.cors);
      }
    }

    // POST /capture-order  body: { orderID: "..." }
    if (request.method === "POST" && url.pathname === "/capture-order") {
      const gate = enforceBrowserOnly(request, env);
      if (!gate.ok) return gate.res;

      const body = await request.json<any>().catch(() => null);
      if (!body) return badRequest("Expected JSON body.", gate.cors);

      const orderID = String(body.orderID ?? "").trim();
      if (!orderID) return badRequest("orderID is required.", gate.cors);

      try {
        const token = await getPayPalAccessToken(env);

        const { res, data } = await paypalFetch(
          token,
          `/v2/checkout/orders/${encodeURIComponent(orderID)}/capture`,
          { method: "POST", body: JSON.stringify({}) }
        );

        if (!res.ok) {
          return json({ ok: false, paypalError: data }, res.status, gate.cors);
        }

        return json({ ok: true, capture: data }, 200, gate.cors);
      } catch (e: any) {
        return json({ ok: false, error: e?.message ?? String(e) }, 500, gate.cors);
      }
    }

    return json({ ok: false, error: "Not found", path: url.pathname }, 404, corsHeaders(reqOrigin, allowed));
  },
};