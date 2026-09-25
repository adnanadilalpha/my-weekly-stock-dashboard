"""
MWS Chat — Modal stub for Gemma 4B (QLoRA).

Deploy when the fine-tuned artifact is ready:

  modal deploy modal/mws_chat_app.py

Env on Modal: MODEL_VOLUME / HF token as needed.
The Next.js platform API calls MODAL_CHAT_URL with OpenAI-compatible JSON:

  POST { "messages": [...], "stream": false }
  → { "choices": [{ "message": { "content": "..." } }] }

Until the real model is wired, keep NEXT_PUBLIC_FEATURE_AI_CHAT=false
and/or omit MODAL_CHAT_URL so the API returns a Brief fallback.
"""

from __future__ import annotations

# Placeholder — replace with Modal + vLLM / transformers serving of Gemma 4B LoRA.
# Intentionally not importing modal at module level so local lint does not require it.

APP_DOC = __doc__


def openai_compatible_reply(messages: list[dict]) -> dict:
    """Dev stub used only if you run a local mock server."""
    last_user = next((m["content"] for m in reversed(messages) if m.get("role") == "user"), "")
    return {
        "choices": [
            {
                "message": {
                    "role": "assistant",
                    "content": (
                        "MWS Chat stub: fine-tuned Gemma 4B is not deployed yet. "
                        f"Received question length={len(last_user)}. "
                        "Use MWS Brief for deterministic explanations."
                    ),
                }
            }
        ]
    }


if __name__ == "__main__":
    print(APP_DOC)
    print(openai_compatible_reply([{"role": "user", "content": "What is Rating?"}]))
