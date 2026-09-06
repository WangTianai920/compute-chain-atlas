/** Cloudflare Worker entry point for the vinext-starter template. */
import { handleImageOptimization, DEFAULT_DEVICE_SIZES, DEFAULT_IMAGE_SIZES } from "vinext/server/image-optimization";
import handler from "vinext/server/app-router-entry";
import { PROFILE_JOB_HEADER, updateCompanyProfileJob } from "../lib/company-profile-job";

interface Env extends Pick<Cloudflare.Env, "DB"> {
  ASSETS: Fetcher;
  COMPANY_PROFILE_SERVICE: Fetcher;
  IMAGES: {
    input(stream: ReadableStream): {
      transform(options: Record<string, unknown>): {
        output(options: { format: string; quality: number }): Promise<{ response(): Response }>;
      };
    };
  };
}

// Image security config. SVG sources with .svg extension auto-skip the
// optimization endpoint on the client side (served directly, no proxy).
// To route SVGs through the optimizer (with security headers), set
// dangerouslyAllowSVG: true in next.config.js and uncomment below:
// const imageConfig: ImageConfig = { dangerouslyAllowSVG: true };

const worker = {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    if (
      url.pathname.startsWith("/_next/static/") ||
      url.pathname === "/favicon.svg" ||
      url.pathname === "/og.png"
    ) {
      const assetResponse = await env.ASSETS.fetch(request);
      if (!assetResponse.ok) return assetResponse;

      const headers = new Headers(assetResponse.headers);
      if (url.pathname.startsWith("/_next/static/")) {
        headers.set("cache-control", "public, max-age=31536000, immutable");
      }
      return new Response(assetResponse.body, {
        status: assetResponse.status,
        statusText: assetResponse.statusText,
        headers,
      });
    }

    if (url.pathname === "/_vinext/image") {
      const allowedWidths = [...DEFAULT_DEVICE_SIZES, ...DEFAULT_IMAGE_SIZES];
      return handleImageOptimization(request, {
        fetchAsset: (path) => env.ASSETS.fetch(new Request(new URL(path, request.url))),
        transformImage: async (body, { width, format, quality }) => {
          const result = await env.IMAGES.input(body).transform(width > 0 ? { width } : {}).output({ format, quality });
          return result.response();
        },
      }, allowedWidths);
    }

    const handlerRequest = url.pathname === "/api/market" ? withoutInternalRefreshParameter(request) : request;
    const response = await handler.fetch(handlerRequest, env, ctx);
    const profileJobId = response.headers.get(PROFILE_JOB_HEADER);
    if (response.ok && profileJobId) return startCompanyProfileWorkflow(response, env, profileJobId);
    if (url.pathname === "/api/market" && !isJsonResponse(response)) {
      console.error(JSON.stringify({
        event: "market_api_non_json_response",
        status: response.status,
        contentType: response.headers.get("content-type"),
      }));
      return Response.json(
        { error: "行情接口响应异常，请稍后重试" },
        { status: 502, headers: { "cache-control": "no-store" } },
      );
    }
    if (url.pathname === "/api/market" && request.method === "GET") {
      const refreshMode = response.headers.get("x-market-refresh");
      if (isMarketMode(refreshMode)) {
        ctx.waitUntil(refreshMarketData(handlerRequest, env, ctx, refreshMode));
      }
      if (response.headers.get("x-market-refresh-signals") === "1" && refreshMode !== "signals") {
        ctx.waitUntil(refreshMarketData(handlerRequest, env, ctx, "signals"));
      }
    }
    return response;
  },
} satisfies ExportedHandler<Env>;

async function startCompanyProfileWorkflow(response: Response, env: Env, jobId: string) {
  const code = jobId.slice(0, 6);
  const headers = new Headers(response.headers);
  headers.delete(PROFILE_JOB_HEADER);
  try {
    const queueResponse = await env.COMPANY_PROFILE_SERVICE.fetch(new Request("https://profile-service.internal/start", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ code, jobId }),
    }));
    if (!queueResponse.ok) throw new Error(`profile service returned ${queueResponse.status}`);
    console.log(JSON.stringify({ event: "company_profile_queued", code, jobId }));
    return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await updateCompanyProfileJob(env.DB, code, jobId, { status: "failed", error: `后台任务启动失败：${message}`.slice(0, 500), completedAt: new Date().toISOString() });
    console.error(JSON.stringify({ event: "company_profile_queue_failed", code, jobId, error: message }));
    return Response.json({ error: "标的已保存，但后台资料任务启动失败，可在管理页面重试" }, { status: 503, headers: { "cache-control": "no-store" } });
  }
}

function isJsonResponse(response: Response) {
  return response.headers.get("content-type")?.toLowerCase().includes("application/json") ?? false;
}

function withoutInternalRefreshParameter(request: Request) {
  const url = new URL(request.url);
  if (!url.searchParams.has("__refresh")) return request;
  url.searchParams.delete("__refresh");
  return new Request(url, request);
}

function isMarketMode(value: string | null): value is "overview" | "signals" | "news" | "full" {
  return value === "overview" || value === "signals" || value === "news" || value === "full";
}

async function refreshMarketData(request: Request, env: Env, ctx: ExecutionContext, mode: "overview" | "signals" | "news" | "full") {
  const url = new URL(request.url);
  url.searchParams.set("mode", mode);
  url.searchParams.set("__refresh", "1");
  try {
    const response = await handler.fetch(new Request(url, { headers: { accept: "application/json" } }), env, ctx);
    if (!response.ok || !isJsonResponse(response)) {
      throw new Error(`refresh returned ${response.status}`);
    }
    await response.arrayBuffer();
  } catch (error) {
    console.error(JSON.stringify({
      event: "market_snapshot_refresh_failed",
      mode,
      error: error instanceof Error ? error.message : String(error),
    }));
  }
}

export default worker;
