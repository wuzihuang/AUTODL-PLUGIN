import { AutodlHttpError } from "./autodl-client.mjs";

const SECRET_KEYS = new Set([
  "authorization",
  "jupyter_token",
  "root_password",
  "token",
]);

export function redactSecrets(value) {
  if (Array.isArray(value)) return value.map(redactSecrets);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value).map(([key, child]) => [
      key,
      SECRET_KEYS.has(key.toLowerCase()) ? "[REDACTED]" : redactSecrets(child),
    ]),
  );
}

export function withoutControlFields(args, fields = ["confirm"]) {
  return Object.fromEntries(
    Object.entries(args).filter(([key, value]) => !fields.includes(key) && value !== undefined),
  );
}

function text(payload) {
  return JSON.stringify(payload, null, 2);
}

export function result(payload, isError = false) {
  return {
    isError,
    content: [{ type: "text", text: text(payload) }],
    structuredContent: payload,
  };
}

export function success(httpResponse, transform = (value) => value) {
  const body = transform(httpResponse.body);
  return result({
    ok: true,
    http_status: httpResponse.httpStatus,
    code: body?.code,
    msg: body?.msg ?? "",
    request_id: body?.request_id,
    data: body?.code === "Success" ? body.data : body,
  });
}

export function failure(error) {
  const details = error instanceof AutodlHttpError ? error.details : {};
  return result(
    {
      ok: false,
      error: {
        kind: details.kind ?? "unexpected",
        message: error instanceof Error ? error.message : String(error),
        http_status: details.httpStatus,
        code: details.code,
        request_id: details.requestId,
        response: details.response ? redactSecrets(details.response) : undefined,
      },
    },
    true,
  );
}

export function preview(operation, method, path, body) {
  return result({
    ok: true,
    executed: false,
    confirmation_required: true,
    operation,
    request_preview: {
      method,
      path,
      body: redactSecrets(body),
    },
    next_step: "确认目标、费用和数据影响后，使用相同参数并设置 confirm=true。",
  });
}

export function apiHandler(action, transform) {
  return async (args) => {
    try {
      const response = await action(args);
      return success(response, transform);
    } catch (error) {
      return failure(error);
    }
  };
}

export function mutationHandler({ operation, method, path, request, bodyFromArgs }) {
  return async (args) => {
    const body = bodyFromArgs(args);
    if (args.confirm !== true) return preview(operation, method, path, body);
    try {
      return success(await request(body));
    } catch (error) {
      return failure(error);
    }
  };
}

export const readOnlyAnnotations = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: true,
};

export const mutatingAnnotations = {
  readOnlyHint: false,
  destructiveHint: false,
  idempotentHint: false,
  openWorldHint: true,
};

export const destructiveAnnotations = {
  readOnlyHint: false,
  destructiveHint: true,
  idempotentHint: false,
  openWorldHint: true,
};
