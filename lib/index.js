// dsh-session-title-regen — node half.
//
// Serves one loopback-only bridge route, POST /api/dsh-session-title-regen/generate,
// that regenerates a session title on demand:
//   1. read the session's persisted event log via ctx.sessionQuery.readSession,
//   2. collect the last 10 user prompts (user/message events with source.kind "user"),
//   3. resolve the model route the session last used (latest request/header fold),
//   4. call ctx.llm on that route with the least supported reasoning effort,
//   5. normalize the first output line into a title and return it to the client,
//      which shows an editable preview and commits via the session rename RPC.
//
// The prompt/normalization helpers mirror @deepseek-ai/dsh-session-title-all-prompts-llm
// (the shipped automatic provider) but with "regenerate" semantics: a fresh title is
// always produced, the stale currentTitle is passed only as context.

import { BlockAssembler, createUserMessage } from "@deepseek-ai/dsh-llm";
import { normalizeSessionTitle } from "@deepseek-ai/dsh-session-title";
import { deepFreeze } from "@deepseek-ai/dsh-util-values";

const name = "session-title-regen";
const inject = ["sessionQuery", "llm", "webServer"];

const BRIDGE_PREFIX = "/api/dsh-session-title-regen";
const MAX_JSON_BODY_BYTES = 64 * 1024;
const MAX_PROMPTS = 10;
const MAX_INPUT_BYTES = 16 * 1024;
const MAX_OUTPUT_TOKENS = 64;
const TITLE_MAX_BYTES = 200;
const TIMEOUT_MS = 30000;
const TARGET_WORDS = 6;
const TARGET_CJK_CHARACTERS = 12;

/** Build a tagged bridge error; the route handler maps `code` onto the JSON body. */
function bridgeError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

// ── loopback bridge plumbing (same shape as dsh-free-search's settings bridge) ──

function isLoopbackRequest(request) {
  const address = request.socket.remoteAddress;
  if (address !== "127.0.0.1" && address !== "::1" && address !== "::ffff:127.0.0.1") return false;
  const host = request.headers.host;
  if (typeof host !== "string") return false;
  let hostUrl;
  try {
    hostUrl = new URL("http://" + host);
  } catch {
    return false;
  }
  if (hostUrl.hostname !== "127.0.0.1" && hostUrl.hostname !== "localhost" && hostUrl.hostname !== "[::1]") return false;
  if (request.headers["sec-fetch-site"] === "cross-site") return false;
  const origin = request.headers.origin;
  if (origin === undefined) return true;
  try {
    return new URL(origin).host === hostUrl.host;
  } catch {
    return false;
  }
}

function writeJson(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, { "content-type": "application/json; charset=utf-8", "referrer-policy": "no-referrer" });
  res.end(payload);
}

async function readJsonBody(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    const buffer = chunk;
    size += buffer.length;
    if (size > MAX_JSON_BODY_BYTES) return undefined;
    chunks.push(buffer);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    return undefined;
  }
}

// ── event-log folding ──

/**
 * Collect human prompt texts in order. Tool results, system notices, and
 * blank/control-only messages are skipped: only events the human typed count.
 */
function collectUserPrompts(events) {
  const prompts = [];
  for (const event of events) {
    if (event.type !== "user/message") continue;
    const source = event.data?.source;
    if (!source || source.kind !== "user") continue;
    const content = Array.isArray(event.data?.content) ? event.data.content : [];
    const text = content
      .filter((block) => block && block.type === "text" && typeof block.text === "string")
      .map((block) => block.text)
      .join("\n");
    if (normalizeSessionTitle(text, Number.MAX_SAFE_INTEGER).length === 0) continue;
    prompts.push(text);
  }
  return prompts;
}

/** Latest concrete provider/model route logged by the session's own main requests. */
function lastModelRoute(events) {
  let route;
  for (const event of events) {
    if (event.type !== "request/header") continue;
    const config = event.data?.header?.config;
    if (!config || typeof config.provider !== "string" || config.provider.length === 0) continue;
    if (typeof config.model !== "string" || config.model.length === 0) continue;
    route = { provider: config.provider, model: config.model };
  }
  return route;
}

// ── prompt construction and output interpretation (mirrors all-prompts-llm) ──

function systemPrompt(hasCurrentTitle) {
  return [
    "Create a concise title for an AI coding-assistant session from the supplied recent human messages.",
    "Return only the title on one line, **in plain text of natural language**, with no quotes, prefix, explanation, Markdown, XML, or terminal control codes. No code is allowed.",
    "Use the language of the messages.",
    `Aim for about ${TARGET_WORDS} words in non-CJK languages or ${TARGET_CJK_CHARACTERS} CJK characters.`,
    "If the messages give little to name, still return a short best-effort title, such as Greeting, instead of explaining.",
    ...(hasCurrentTitle
      ? ["The session carries a stale title given as currentTitle. Generate a fresh title that fits the supplied recent messages; keeping the old wording is allowed only when it already fits."]
      : []),
  ].join("\n");
}

/** Frame messages as JSON so user text cannot break structural delimiters. */
function frameMessages(messages, currentTitle) {
  if (currentTitle !== undefined) {
    return `Generate a new session title from this JSON object:\n${JSON.stringify({ currentTitle, messages })}`;
  }
  return `Generate the session title from this JSON array of human messages:\n${JSON.stringify(messages)}`;
}

/** Asterisk emphasis wrapping a whole line, such as `**Title**`. */
const EMPHASIS_WRAPPER = /^(?<marker>\*{1,3})(?<inner>\S(?:.*\S)?)\k<marker>$/u;

/** Take the title from model output: first non-empty line, minus whole-line emphasis. */
function titleFromOutput(text) {
  const line = text.split(/\r?\n/u).map((item) => item.trim()).find((item) => item.length > 0) ?? "";
  const groups = EMPHASIS_WRAPPER.exec(line)?.groups;
  const marker = groups?.["marker"];
  const inner = groups?.["inner"];
  return marker === undefined || inner === undefined || inner.includes(marker) ? line : inner;
}

// ── generation ──

/**
 * Regenerate one session title from its own log and route.
 * @returns `{title, model}` on success; throws tagged `bridgeError`s otherwise.
 */
async function generateTitle(ctx, sessionId, currentTitle) {
  const loaded = await ctx.sessionQuery.readSession(sessionId);
  if (loaded === undefined || loaded === null || loaded.session === undefined) {
    throw bridgeError("session-not-found", `session "${sessionId}" was not found in the session store`);
  }
  const events = Array.isArray(loaded.events) ? loaded.events : [];
  const prompts = collectUserPrompts(events);
  if (prompts.length === 0) throw bridgeError("no-user-prompts", "该会话没有可用于生成标题的用户消息 (no user prompts recorded in this session)");
  const route = lastModelRoute(events);
  if (route === undefined) throw bridgeError("no-model-route", "该会话没有记录过模型调用，无法确定生成标题的模型 (no model route recorded in this session)");

  // Keep the last MAX_PROMPTS prompts, then drop the oldest until the framed input fits.
  let messages = prompts.slice(-MAX_PROMPTS);
  let input = frameMessages(messages, currentTitle);
  while (messages.length > 1 && Buffer.byteLength(input, "utf8") > MAX_INPUT_BYTES) {
    messages = messages.slice(1);
    input = frameMessages(messages, currentTitle);
  }
  if (Buffer.byteLength(input, "utf8") > MAX_INPUT_BYTES) {
    messages = [Buffer.from(messages[0], "utf8").subarray(0, MAX_INPUT_BYTES).toString("utf8")];
    input = frameMessages(messages, currentTitle);
  }

  const signal = AbortSignal.timeout(TIMEOUT_MS);
  const userMessages = [createUserMessage({
    content: [{ type: "text", text: input }],
    source: { kind: "dsh-session-title-regen" },
  })];
  const call = await ctx.llm.prepareCall({ ...route, maxTokens: MAX_OUTPUT_TOKENS }, signal, (controls, model) => {
    // Least supported reasoning effort — a title needs the cheapest thinking.
    const effort = model.reasoning?.efforts?.[0]?.id;
    return { ...controls, ...(effort === undefined ? {} : { reasoningEffort: effort }) };
  });
  const options = deepFreeze({
    ...call.config,
    messages: userMessages,
    system: systemPrompt(currentTitle !== undefined),
    sessionId,
    purpose: "session-title",
    signal,
  });
  const assembler = new BlockAssembler();
  for await (const chunk of call.stream(options)) {
    signal.throwIfAborted();
    assembler.push(chunk);
  }
  const finish = assembler.finish;
  if (finish.kind === "error" || finish.kind === "aborted") {
    throw bridgeError("llm-failed", finish.failure?.message ?? `model call ${finish.kind}`);
  }
  if (finish.kind === "tool-calls") throw bridgeError("llm-tool-calls", "model returned tool calls instead of a title");
  // "max-tokens" keeps whatever text arrived: a title is one short line.
  const raw = assembler.blocks().filter((block) => block.type === "text").map((block) => block.text).join(" ");
  const title = normalizeSessionTitle(titleFromOutput(raw), TITLE_MAX_BYTES);
  if (title.length === 0) throw bridgeError("empty-title", "model produced no usable title");
  return { title, model: route };
}

// ── bundle entry ──

/**
 * Register the bridge route. No configuration: the route, prompt budget, and
 * length targets are fixed constants above.
 * @param ctx - context exposing sessionQuery, llm, and webServer services.
 */
function apply(ctx, config) {
  ctx.webServer.register({
    kind: "exact",
    path: `${BRIDGE_PREFIX}/generate`,
    handler: async (req, res) => {
      if (!isLoopbackRequest(req)) {
        writeJson(res, 403, { ok: false, code: "loopback-only", message: "loopback requests only" });
        return;
      }
      if (req.method !== "POST") {
        writeJson(res, 405, { ok: false, code: "method-not-allowed", message: `method not allowed: ${req.method ?? ""}` });
        return;
      }
      const body = await readJsonBody(req);
      if (body === undefined || body === null || typeof body.sessionId !== "string" || body.sessionId.length === 0) {
        writeJson(res, 400, { ok: false, code: "bad-request", message: "malformed JSON body or missing sessionId" });
        return;
      }
      const currentTitle = typeof body.currentTitle === "string" && body.currentTitle.trim().length > 0 ? body.currentTitle.trim() : undefined;
      try {
        const result = await generateTitle(ctx, body.sessionId, currentTitle);
        writeJson(res, 200, { ok: true, ...result });
      } catch (error) {
        const timedOut = (error instanceof Error && error.name === "TimeoutError") || (error instanceof Error && error.code === "ABORT_ERR");
        const status = timedOut ? 504 : typeof error?.code === "string" && ["session-not-found", "no-user-prompts", "no-model-route", "bad-request"].includes(error.code) ? 404 : 502;
        writeJson(res, status, {
          ok: false,
          code: (typeof error?.code === "string" ? error.code : undefined) ?? (timedOut ? "timeout" : "generate-failed"),
          message: error instanceof Error ? error.message : String(error),
        });
      }
    },
  });
}

export { apply, inject, name };
