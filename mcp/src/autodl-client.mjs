import http from "node:http";
import https from "node:https";

export class AutodlHttpError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = "AutodlHttpError";
    this.details = details;
  }
}

function positiveInteger(value, fallback) {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function normalizeBaseUrl(value) {
  return value.endsWith("/") ? value : `${value}/`;
}

function appendQuery(url, query) {
  if (!query) return;
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null || value === "") continue;
    if (Array.isArray(value)) {
      for (const item of value) url.searchParams.append(key, String(item));
    } else {
      url.searchParams.set(key, String(value));
    }
  }
}

export class AutodlClient {
  constructor(options = {}) {
    this.token = options.token ?? process.env.AUTODL_TOKEN ?? "";
    this.baseUrl = normalizeBaseUrl(
      options.baseUrl ?? process.env.AUTODL_BASE_URL ?? "https://api.autodl.com",
    );
    this.webBaseUrl = normalizeBaseUrl(
      options.webBaseUrl ?? process.env.AUTODL_WEB_BASE_URL ?? "https://www.autodl.com",
    );
    this.metricsUrl =
      options.metricsUrl ??
      process.env.AUTODL_METRICS_URL ??
      "http://127.0.0.1:2022/autopanel/v1/api/monitor/current";
    this.timeoutMs = positiveInteger(
      options.timeoutMs ?? process.env.AUTODL_REQUEST_TIMEOUT_MS,
      20_000,
    );
  }

  async api({ method, path, body, query }) {
    return this.request({
      method,
      url: new URL(path, this.baseUrl),
      body,
      query,
      auth: true,
    });
  }

  async webApi({ method, path, body, query }) {
    return this.request({
      method,
      url: new URL(path, this.webBaseUrl),
      body,
      query,
      auth: true,
    });
  }

  async localMetrics(url = this.metricsUrl) {
    return this.request({ method: "GET", url: new URL(url), auth: false });
  }

  async request({ method, url, body, query, auth }) {
    if (auth && !this.token) {
      throw new AutodlHttpError(
        "缺少 AUTODL_TOKEN。请在 MCP 服务环境变量中配置开发者 Token。",
        { kind: "configuration" },
      );
    }

    appendQuery(url, query);
    const payload = body === undefined ? undefined : JSON.stringify(body);
    const transport = url.protocol === "https:" ? https : http;
    const headers = {
      Accept: "application/json",
      "User-Agent": "autodl-mcp/1.0.0",
    };
    if (auth) headers.Authorization = this.token;
    if (payload !== undefined) {
      headers["Content-Type"] = "application/json";
      headers["Content-Length"] = Buffer.byteLength(payload);
    }

    return new Promise((resolve, reject) => {
      const request = transport.request(
        url,
        { method, headers, timeout: this.timeoutMs },
        (response) => {
          const chunks = [];
          response.on("data", (chunk) => chunks.push(chunk));
          response.on("end", () => {
            const raw = Buffer.concat(chunks).toString("utf8");
            let parsed;
            try {
              parsed = raw ? JSON.parse(raw) : null;
            } catch {
              reject(
                new AutodlHttpError("AutoDL 返回了非 JSON 响应。", {
                  kind: "invalid_response",
                  httpStatus: response.statusCode,
                  bodyPreview: raw.slice(0, 500),
                }),
              );
              return;
            }

            if ((response.statusCode ?? 500) < 200 || (response.statusCode ?? 500) >= 300) {
              reject(
                new AutodlHttpError(`AutoDL HTTP 请求失败：${response.statusCode}`, {
                  kind: "http",
                  httpStatus: response.statusCode,
                  response: parsed,
                }),
              );
              return;
            }

            if (
              parsed &&
              typeof parsed === "object" &&
              typeof parsed.code === "string" &&
              parsed.code !== "Success"
            ) {
              reject(
                new AutodlHttpError(parsed.msg || `AutoDL API 返回错误代码：${parsed.code}`, {
                  kind: "api",
                  httpStatus: response.statusCode,
                  code: parsed.code,
                  requestId: parsed.request_id,
                  response: parsed,
                }),
              );
              return;
            }

            resolve({ httpStatus: response.statusCode, body: parsed });
          });
        },
      );

      request.on("timeout", () => {
        request.destroy(
          new AutodlHttpError(`AutoDL 请求超过 ${this.timeoutMs}ms。`, {
            kind: "timeout",
          }),
        );
      });
      request.on("error", (error) => {
        reject(
          error instanceof AutodlHttpError
            ? error
            : new AutodlHttpError(error.message, { kind: "network" }),
        );
      });
      if (payload !== undefined) request.write(payload);
      request.end();
    });
  }
}
