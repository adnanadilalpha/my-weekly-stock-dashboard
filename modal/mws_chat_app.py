"""
MWS Chat — Modal OpenAI-compatible endpoint (DeepSeek-V4.1-Flash).

The live server is deployed separately. Next.js calls it via the `openai` SDK:

  baseURL = MODAL_CHAT_BASE_URL
            (default https://adnanadilalpha--ep-mws-ai-server.us-west.modal.direct/v1)
  apiKey  = MODAL_PROXY_TOKEN_ID.MODAL_PROXY_TOKEN_SECRET
  model   = MODAL_CHAT_MODEL (default deepseek-ai/DeepSeek-V4.1-Flash)

`/api/ai/chat` builds messages with the same SYSTEM_PROMPT + MWS DATA block used
for Google Studio (`buildChatMessages` in lib/intelligence/chat/context.ts), then
dispatches to Modal when MWS_CHAT_PROVIDER=modal or proxy tokens are configured.
"""

from __future__ import annotations

APP_DOC = __doc__


def openai_compatible_reply(messages: list[dict]) -> dict:
    """Dev stub — production traffic hits the Modal DeepSeek endpoint above."""
    last_user = next((m["content"] for m in reversed(messages) if m.get("role") == "user"), "")
    return {
        "choices": [
            {
                "message": {
                    "role": "assistant",
                    "content": (
                        "MWS Chat stub (local only). "
                        f"Received question length={len(last_user)}. "
                        "Configure MODAL_PROXY_TOKEN_ID/SECRET against the live Modal server."
                    ),
                }
            }
        ]
    }


if __name__ == "__main__":
    print(APP_DOC)
    print(openai_compatible_reply([{"role": "user", "content": "What is Rating?"}]))
