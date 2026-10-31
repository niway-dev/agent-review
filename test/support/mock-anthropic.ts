/**
 * A tiny mock of the Anthropic Messages API for test/provider-isolation.test.ts. It runs as its
 * own process because the adapter calls `claude` with `spawnSync`, which would block an in-process
 * server. Usage: bun mock-anthropic.ts <requests.jsonl> <control-file>
 *
 * Every Messages request body is appended to the log as one JSON string per line. If the control
 * file holds a path, the first request without a tool result asks the model's Read tool for it.
 * Everything else is answered with the text "ok". Prints `PORT=<n>` once it listens.
 */
import { appendFileSync, existsSync, readFileSync } from "node:fs";

const [log, control] = process.argv.slice(2);

function sse(events: Array<[string, object]>) {
  return events.map(([name, data]) => `event: ${name}\ndata: ${JSON.stringify(data)}\n\n`).join("");
}

function reply(body: { stream?: boolean; model?: string }, hasToolResult: boolean) {
  const readPath = existsSync(control) ? readFileSync(control, "utf8").trim() : "";
  const useTool = readPath !== "" && !hasToolResult;
  const content = useTool
    ? { type: "tool_use", id: "toolu_1", name: "Read", input: { file_path: readPath } }
    : { type: "text", text: "ok" };
  const message = {
    id: "msg_1",
    type: "message",
    role: "assistant",
    model: body.model ?? "claude-sonnet-5-5",
    content: [content],
    stop_reason: useTool ? "tool_use" : "end_turn",
    stop_sequence: null,
    usage: { input_tokens: 10, output_tokens: 5 },
  };
  if (!body.stream) return new Response(JSON.stringify(message), { headers: { "content-type": "application/json" } });
  const start = { ...message, content: [], stop_reason: null, usage: { input_tokens: 10, output_tokens: 1 } };
  const block = useTool ? { type: "tool_use", id: "toolu_1", name: "Read", input: {} } : { type: "text", text: "" };
  const delta = useTool
    ? { type: "input_json_delta", partial_json: JSON.stringify({ file_path: readPath }) }
    : { type: "text_delta", text: "ok" };
  return new Response(
    sse([
      ["message_start", { type: "message_start", message: start }],
      ["content_block_start", { type: "content_block_start", index: 0, content_block: block }],
      ["content_block_delta", { type: "content_block_delta", index: 0, delta }],
      ["content_block_stop", { type: "content_block_stop", index: 0 }],
      [
        "message_delta",
        { type: "message_delta", delta: { stop_reason: message.stop_reason, stop_sequence: null }, usage: { output_tokens: 5 } },
      ],
      ["message_stop", { type: "message_stop" }],
    ]),
    { headers: { "content-type": "text/event-stream" } },
  );
}

const server = Bun.serve({
  port: 0,
  hostname: "127.0.0.1",
  async fetch(req) {
    const text = await req.text();
    if (!new URL(req.url).pathname.includes("/messages")) {
      return new Response("{}", { headers: { "content-type": "application/json" } });
    }
    appendFileSync(log, `${JSON.stringify(text)}\n`);
    return reply(JSON.parse(text), text.includes("tool_result"));
  },
});
console.log(`PORT=${server.port}`);
