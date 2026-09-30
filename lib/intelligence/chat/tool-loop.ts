import OpenAI from 'openai';
import {
  GEMINI_FUNCTION_DECLARATIONS,
  OPENAI_CHAT_TOOLS,
  collectWidgets,
  executeChatTool,
  type ChatWidget,
  type ToolExecution,
} from './tools';
import type { ChatMessage, ChatModelResult, ChatProvider } from './context';

export type ChatWithToolsResult =
  | {
      ok: true;
      text: string;
      provider: ChatProvider;
      widgets: ChatWidget[];
    }
  | {
      ok: false;
      error: string;
      status: number;
      provider?: ChatProvider;
    };

const MAX_TOOL_ROUNDS = 3;

type GeminiPart =
  | { text: string }
  | { functionCall: { name: string; args?: Record<string, unknown> } }
  | { functionResponse: { name: string; response: Record<string, unknown> } };

type GeminiContent = { role: 'user' | 'model'; parts: GeminiPart[] };

function textFromGeminiParts(parts: GeminiPart[] | undefined): string {
  if (!parts?.length) return '';
  return parts
    .map((p) => ('text' in p && typeof p.text === 'string' ? p.text : ''))
    .join('')
    .trim();
}

function functionCallsFromGeminiParts(
  parts: GeminiPart[] | undefined,
): { name: string; args: Record<string, unknown> }[] {
  if (!parts?.length) return [];
  const out: { name: string; args: Record<string, unknown> }[] = [];
  for (const p of parts) {
    if ('functionCall' in p && p.functionCall?.name) {
      out.push({
        name: p.functionCall.name,
        args: (p.functionCall.args ?? {}) as Record<string, unknown>,
      });
    }
  }
  return out;
}

async function geminiGenerate(input: {
  apiKey: string;
  model: string;
  system: string;
  contents: GeminiContent[];
  withTools: boolean;
}): Promise<
  | { ok: true; parts: GeminiPart[]; text: string; calls: { name: string; args: Record<string, unknown> }[] }
  | { ok: false; error: string; status: number }
> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(input.model)}:generateContent`;
  const body: Record<string, unknown> = {
    contents: input.contents,
    generationConfig: {
      temperature: 0.25,
      maxOutputTokens: 1024,
    },
  };
  if (input.system.trim()) {
    body.systemInstruction = { parts: [{ text: input.system }] };
  }
  if (input.withTools) {
    body.tools = [{ functionDeclarations: GEMINI_FUNCTION_DECLARATIONS }];
  }

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': input.apiKey,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errBody = await res.text().catch(() => '');
    const status = res.status === 429 ? 429 : res.status === 403 ? 403 : 502;
    return {
      ok: false,
      error: `Google Studio error ${res.status}: ${errBody.slice(0, 240)}`,
      status,
    };
  }

  const json = (await res.json()) as {
    candidates?: { content?: { parts?: GeminiPart[] } }[];
    error?: { message?: string };
  };
  if (json.error?.message) {
    return {
      ok: false,
      error: `Google Studio error: ${json.error.message.slice(0, 240)}`,
      status: 502,
    };
  }

  const parts = json.candidates?.[0]?.content?.parts ?? [];
  return {
    ok: true,
    parts,
    text: textFromGeminiParts(parts),
    calls: functionCallsFromGeminiParts(parts),
  };
}

export async function callGoogleStudioChatWithTools(
  messages: ChatMessage[],
): Promise<ChatWithToolsResult> {
  const apiKey = process.env.GOOGLE_STUDIO_AI_API_KEY?.trim();
  if (!apiKey) {
    return {
      ok: false,
      error: 'Google Studio API key is not configured (GOOGLE_STUDIO_AI_API_KEY).',
      status: 503,
      provider: 'google_studio',
    };
  }

  const model = process.env.GOOGLE_STUDIO_AI_MODEL?.trim() || 'gemini-3.5-flash-lite';
  const system = messages
    .filter((m) => m.role === 'system')
    .map((m) => m.content.trim())
    .filter(Boolean)
    .join('\n\n');

  const contents: GeminiContent[] = messages
    .filter((m) => m.role === 'user' || m.role === 'assistant' || m.role === 'model')
    .map((m) => ({
      role: m.role === 'assistant' || m.role === 'model' ? ('model' as const) : ('user' as const),
      parts: [{ text: m.content }],
    }));

  if (contents.length === 0) {
    return {
      ok: false,
      error: 'No user content to send to Google Studio',
      status: 400,
      provider: 'google_studio',
    };
  }

  const executions: ToolExecution[] = [];
  let withTools = true;

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const turn = await geminiGenerate({
      apiKey,
      model,
      system,
      contents,
      withTools,
    });
    if (!turn.ok) {
      return { ok: false, error: turn.error, status: turn.status, provider: 'google_studio' };
    }

    if (turn.calls.length === 0) {
      if (!turn.text && executions.length > 0) {
        return {
          ok: true,
          text: 'Here’s the visual — see the chart in this chat.',
          provider: 'google_studio',
          widgets: collectWidgets(executions),
        };
      }
      if (!turn.text) {
        return {
          ok: false,
          error: 'Empty Google Studio response',
          status: 502,
          provider: 'google_studio',
        };
      }
      return {
        ok: true,
        text: turn.text,
        provider: 'google_studio',
        widgets: collectWidgets(executions),
      };
    }

    // Append model functionCall turn, then user functionResponse turn.
    contents.push({ role: 'model', parts: turn.parts });
    const responseParts: GeminiPart[] = [];
    for (const call of turn.calls) {
      const ex = executeChatTool(call.name, call.args);
      executions.push(ex);
      responseParts.push({
        functionResponse: {
          name: call.name,
          response: ex.result,
        },
      });
    }
    contents.push({ role: 'user', parts: responseParts });
    // After first tool round, still allow tools in case of multi-step, but usually done.
    withTools = round < MAX_TOOL_ROUNDS - 2;
  }

  return {
    ok: true,
    text: 'Here’s the visual — see the chart in this chat.',
    provider: 'google_studio',
    widgets: collectWidgets(executions),
  };
}

function getModalOpenAIConfig(): {
  baseURL: string;
  apiKey: string;
  model: string;
} | null {
  const id = process.env.MODAL_PROXY_TOKEN_ID?.trim();
  const secret = process.env.MODAL_PROXY_TOKEN_SECRET?.trim();
  const DEFAULT_MODAL_BASE_URL =
    'https://adnanadilalpha--ep-mws-ai-server.us-west.modal.direct/v1';
  const DEFAULT_MODAL_MODEL = 'deepseek-ai/DeepSeek-V4.1-Flash';

  if (id && secret) {
    return {
      baseURL: (process.env.MODAL_CHAT_BASE_URL ?? DEFAULT_MODAL_BASE_URL).trim().replace(/\/$/, ''),
      apiKey: `${id}.${secret}`,
      model: (process.env.MODAL_CHAT_MODEL ?? DEFAULT_MODAL_MODEL).trim(),
    };
  }
  const legacyUrl = process.env.MODAL_CHAT_URL?.trim();
  const legacyKey = process.env.MODAL_CHAT_API_KEY?.trim();
  if (legacyUrl && legacyKey) {
    const baseURL = legacyUrl.replace(/\/chat\/completions\/?$/, '').replace(/\/$/, '');
    return {
      baseURL: baseURL.endsWith('/v1') ? baseURL : `${baseURL}/v1`,
      apiKey: legacyKey,
      model: (process.env.MODAL_CHAT_MODEL ?? DEFAULT_MODAL_MODEL).trim(),
    };
  }
  return null;
}

export async function callModalChatWithTools(
  messages: ChatMessage[],
): Promise<ChatWithToolsResult> {
  const cfg = getModalOpenAIConfig();
  if (!cfg) {
    return {
      ok: false,
      error:
        'Modal chat is not configured. Set MODAL_PROXY_TOKEN_ID + MODAL_PROXY_TOKEN_SECRET (or legacy MODAL_CHAT_URL + MODAL_CHAT_API_KEY).',
      status: 503,
      provider: 'modal',
    };
  }

  try {
    const client = new OpenAI({ baseURL: cfg.baseURL, apiKey: cfg.apiKey });
    const openaiMessages: OpenAI.Chat.ChatCompletionMessageParam[] = messages
      .filter((m) => m.content?.trim())
      .map((m) => {
        if (m.role === 'system') return { role: 'system' as const, content: m.content };
        if (m.role === 'assistant' || m.role === 'model') {
          return { role: 'assistant' as const, content: m.content };
        }
        return { role: 'user' as const, content: m.content };
      });

    if (!openaiMessages.some((m) => m.role === 'user')) {
      return {
        ok: false,
        error: 'No user content to send to Modal',
        status: 400,
        provider: 'modal',
      };
    }

    const executions: ToolExecution[] = [];
    let enableTools = true;

    for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
      const completion = await client.chat.completions.create({
        model: cfg.model,
        messages: openaiMessages,
        temperature: 0.25,
        max_tokens: 1024,
        top_p: 0.9,
        stream: false,
        ...(enableTools ? { tools: OPENAI_CHAT_TOOLS, tool_choice: 'auto' as const } : {}),
        reasoning_effort: 'none',
      } as OpenAI.ChatCompletionCreateParamsNonStreaming);

      const msg = completion.choices?.[0]?.message;
      if (!msg) {
        return { ok: false, error: 'Empty Modal model response', status: 502, provider: 'modal' };
      }

      const toolCalls = msg.tool_calls ?? [];
      if (toolCalls.length === 0) {
        const text = msg.content?.trim() ?? '';
        if (!text && executions.length > 0) {
          return {
            ok: true,
            text: 'Here’s the visual — see the chart in this chat.',
            provider: 'modal',
            widgets: collectWidgets(executions),
          };
        }
        if (!text) {
          return { ok: false, error: 'Empty Modal model response', status: 502, provider: 'modal' };
        }
        return {
          ok: true,
          text,
          provider: 'modal',
          widgets: collectWidgets(executions),
        };
      }

      openaiMessages.push({
        role: 'assistant',
        content: msg.content ?? null,
        tool_calls: toolCalls,
      } as OpenAI.Chat.ChatCompletionAssistantMessageParam);

      for (const call of toolCalls) {
        if (call.type !== 'function') continue;
        let args: Record<string, unknown> = {};
        try {
          args = JSON.parse(call.function.arguments || '{}') as Record<string, unknown>;
        } catch {
          args = {};
        }
        const ex = executeChatTool(call.function.name, args);
        executions.push(ex);
        openaiMessages.push({
          role: 'tool',
          tool_call_id: call.id,
          content: JSON.stringify(ex.result),
        });
      }
      enableTools = round < MAX_TOOL_ROUNDS - 2;
    }

    return {
      ok: true,
      text: 'Here’s the visual — see the chart in this chat.',
      provider: 'modal',
      widgets: collectWidgets(executions),
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return {
      ok: false,
      error: `Modal chat error: ${msg.slice(0, 240)}`,
      status: 502,
      provider: 'modal',
    };
  }
}

function isQuotaOrLimitError(result: ChatWithToolsResult | ChatModelResult): boolean {
  if (result.ok) return false;
  const msg = result.error.toLowerCase();
  const status = result.status;
  if (status === 429 || status === 503) return true;
  return (
    msg.includes('resource_exhausted') ||
    msg.includes('quota') ||
    msg.includes('rate limit') ||
    msg.includes('rate_limit') ||
    msg.includes('too many requests') ||
    msg.includes('exceeded') ||
    msg.includes('429') ||
    msg.includes('billing') ||
    msg.includes('limit: 0') ||
    msg.includes('free_tier')
  );
}

function isGoogleConfigured(): boolean {
  return Boolean(process.env.GOOGLE_STUDIO_AI_API_KEY?.trim());
}

function isModalConfigured(): boolean {
  const id = process.env.MODAL_PROXY_TOKEN_ID?.trim();
  const secret = process.env.MODAL_PROXY_TOKEN_SECRET?.trim();
  if (id && secret) return true;
  if (process.env.MODAL_CHAT_URL?.trim() && process.env.MODAL_CHAT_API_KEY?.trim()) return true;
  return false;
}

function resolvePreferredProvider(): ChatProvider | null {
  const explicit = (process.env.MWS_CHAT_PROVIDER ?? '').trim().toLowerCase();
  if (explicit === 'modal') return isModalConfigured() ? 'modal' : null;
  if (explicit === 'google' || explicit === 'google_studio' || explicit === 'gemini') {
    return isGoogleConfigured() ? 'google_studio' : null;
  }
  if (isGoogleConfigured()) return 'google_studio';
  if (isModalConfigured()) return 'modal';
  return null;
}

/** Tool-aware chat dispatch (Google free → Modal). */
export async function callChatModelWithTools(
  messages: ChatMessage[],
): Promise<ChatWithToolsResult> {
  const preferred = resolvePreferredProvider();
  if (!preferred) {
    return {
      ok: false,
      error:
        'No chat model configured. Set GOOGLE_STUDIO_AI_API_KEY and/or MODAL_PROXY_TOKEN_ID + MODAL_PROXY_TOKEN_SECRET.',
      status: 503,
    };
  }

  if (preferred === 'google_studio') {
    const google = await callGoogleStudioChatWithTools(messages);
    if (google.ok) return google;
    if (isModalConfigured()) {
      console.warn(
        '[chat] Google Studio (tools) unavailable; falling back to Modal.',
        google.status,
        isQuotaOrLimitError(google) ? '(quota/limit)' : '',
        google.error.slice(0, 160),
      );
      return callModalChatWithTools(messages);
    }
    return google;
  }

  const modal = await callModalChatWithTools(messages);
  if (modal.ok) return modal;
  if (isGoogleConfigured()) {
    console.warn(
      '[chat] Modal (tools) unavailable; falling back to Google Studio.',
      modal.status,
      modal.error.slice(0, 160),
    );
    return callGoogleStudioChatWithTools(messages);
  }
  return modal;
}
