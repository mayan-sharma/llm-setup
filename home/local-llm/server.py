#!/usr/bin/env python3
"""
Dependency-free MCP stdio server for routing low-risk Codex subtasks to a
local OpenAI-compatible model server such as LM Studio.
"""

from __future__ import annotations

import json
import os
import sqlite3
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any


SERVER_NAME = "local_llm"
SERVER_VERSION = "0.1.0"
DEFAULT_BASE_URL = os.environ.get("LOCAL_LLM_BASE_URL", "http://localhost:1234/v1")
DEFAULT_MODEL = os.environ.get("LOCAL_LLM_MODEL", "")
LOG_DB = Path(os.environ.get("LOCAL_LLM_LOG_DB", "~/.codex/local-llm/usage.sqlite")).expanduser()
MAX_FILE_CHARS = int(os.environ.get("LOCAL_LLM_MAX_FILE_CHARS", "120000"))
MAX_TEXT_CHARS = int(os.environ.get("LOCAL_LLM_MAX_TEXT_CHARS", "120000"))


def _write(message: dict[str, Any]) -> None:
    sys.stdout.write(json.dumps(message, separators=(",", ":")) + "\n")
    sys.stdout.flush()


def _result(request_id: Any, payload: dict[str, Any]) -> None:
    _write({"jsonrpc": "2.0", "id": request_id, "result": payload})


def _error(request_id: Any, code: int, message: str) -> None:
    _write({"jsonrpc": "2.0", "id": request_id, "error": {"code": code, "message": message}})


def _text_result(text: str) -> dict[str, Any]:
    return {"content": [{"type": "text", "text": text}]}


def _init_log_db() -> None:
    LOG_DB.parent.mkdir(parents=True, exist_ok=True)
    with sqlite3.connect(str(LOG_DB)) as conn:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS local_llm_usage (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                created_at INTEGER NOT NULL,
                tool TEXT NOT NULL,
                model TEXT,
                prompt_chars INTEGER NOT NULL,
                response_chars INTEGER NOT NULL,
                estimated_tokens INTEGER NOT NULL,
                elapsed_ms INTEGER NOT NULL
            )
            """
        )


def _log_usage(tool: str, model: str, prompt: str, response: str, elapsed_ms: int) -> None:
    try:
        _init_log_db()
        total_chars = len(prompt) + len(response)
        with sqlite3.connect(str(LOG_DB)) as conn:
            conn.execute(
                """
                INSERT INTO local_llm_usage
                    (created_at, tool, model, prompt_chars, response_chars, estimated_tokens, elapsed_ms)
                VALUES (?, ?, ?, ?, ?, ?, ?)
                """,
                (int(time.time()), tool, model, len(prompt), len(response), max(1, total_chars // 4), elapsed_ms),
            )
    except Exception:
        # Logging must never make the tool call fail.
        pass


def _load_file(path: str) -> str:
    p = Path(path).expanduser().resolve()
    if not p.exists() or not p.is_file():
        raise ValueError(f"File not found: {p}")
    data = p.read_text(encoding="utf-8", errors="replace")
    if len(data) > MAX_FILE_CHARS:
        return data[:MAX_FILE_CHARS] + f"\n\n[truncated at {MAX_FILE_CHARS} characters]"
    return data


def _models(base_url: str) -> list[str]:
    url = base_url.rstrip("/") + "/models"
    req = urllib.request.Request(url, headers={"Accept": "application/json"})
    with urllib.request.urlopen(req, timeout=10) as response:
        data = json.loads(response.read().decode("utf-8"))
    return [item.get("id", "") for item in data.get("data", []) if item.get("id")]


def _choose_model(base_url: str, requested: str | None) -> str:
    if requested:
        return requested
    if DEFAULT_MODEL:
        return DEFAULT_MODEL
    available = _models(base_url)
    if not available:
        raise ValueError("LM Studio returned no loaded/available models")
    return available[0]


def _chat(
    *,
    tool: str,
    prompt: str,
    system_prompt: str,
    model: str | None = None,
    temperature: float = 0.2,
    max_tokens: int = 2048,
    base_url: str = DEFAULT_BASE_URL,
) -> str:
    if len(prompt) > MAX_TEXT_CHARS:
        prompt = prompt[:MAX_TEXT_CHARS] + f"\n\n[truncated at {MAX_TEXT_CHARS} characters]"
    system_prompt = (
        system_prompt.rstrip()
        + "\n\nReturn only the final answer. Do not include hidden reasoning, chain-of-thought, or a 'Thinking Process' section."
    )
    prompt = "/no_think\n" + prompt
    selected_model = _choose_model(base_url, model)
    body = {
        "model": selected_model,
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": prompt},
        ],
        "temperature": temperature,
        "max_tokens": max_tokens,
    }
    data = json.dumps(body).encode("utf-8")
    req = urllib.request.Request(
        base_url.rstrip("/") + "/chat/completions",
        data=data,
        headers={"Content-Type": "application/json", "Accept": "application/json"},
        method="POST",
    )
    start = time.time()
    try:
        with urllib.request.urlopen(req, timeout=180) as response:
            payload = json.loads(response.read().decode("utf-8"))
    except urllib.error.URLError as exc:
        raise RuntimeError(f"Could not reach local LLM at {base_url}: {exc}") from exc
    elapsed_ms = int((time.time() - start) * 1000)
    try:
        message = payload["choices"][0]["message"]
        text = message.get("content") or ""
        if not text and message.get("reasoning_content"):
            text = "[local model returned reasoning_content but no final answer; retry with a non-reasoning model or a larger max_tokens budget]"
    except (KeyError, IndexError, TypeError) as exc:
        raise RuntimeError(f"Unexpected local LLM response: {json.dumps(payload)[:1000]}") from exc
    _log_usage(tool, selected_model, system_prompt + "\n\n" + prompt, text, elapsed_ms)
    return text


TOOLS: list[dict[str, Any]] = [
    {
        "name": "chat",
        "description": "Send a low-risk drafting or analysis prompt to the local LLM. Treat output as a draft.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "prompt": {"type": "string"},
                "system_prompt": {"type": "string"},
                "model": {"type": "string"},
                "temperature": {"type": "number"},
                "max_tokens": {"type": "integer"},
            },
            "required": ["prompt"],
        },
    },
    {
        "name": "summarize_text",
        "description": "Compress large text, logs, notes, or copied research content using the local LLM.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "text": {"type": "string"},
                "purpose": {"type": "string"},
                "model": {"type": "string"},
                "max_tokens": {"type": "integer"},
            },
            "required": ["text"],
        },
    },
    {
        "name": "summarize_file",
        "description": "Read a local text file and summarize it using the local LLM before Codex spends context on it.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "path": {"type": "string"},
                "purpose": {"type": "string"},
                "model": {"type": "string"},
                "max_tokens": {"type": "integer"},
            },
            "required": ["path"],
        },
    },
    {
        "name": "draft_from_context",
        "description": "Create first-draft docs, tests, boilerplate, or structured markdown from supplied context.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "task": {"type": "string"},
                "context": {"type": "string"},
                "output_format": {"type": "string"},
                "model": {"type": "string"},
                "temperature": {"type": "number"},
                "max_tokens": {"type": "integer"},
            },
            "required": ["task", "context"],
        },
    },
    {
        "name": "review_diff",
        "description": "Run a broad first-pass local review over a diff. Codex must validate findings.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "diff": {"type": "string"},
                "focus": {"type": "string"},
                "model": {"type": "string"},
                "max_tokens": {"type": "integer"},
            },
            "required": ["diff"],
        },
    },
    {
        "name": "list_models",
        "description": "List models reported by the local OpenAI-compatible server.",
        "inputSchema": {"type": "object", "properties": {}},
    },
]


def _call_tool(name: str, args: dict[str, Any]) -> str:
    if name == "list_models":
        return "\n".join(_models(DEFAULT_BASE_URL)) or "No models returned."
    if name == "chat":
        return _chat(
            tool=name,
            prompt=args["prompt"],
            system_prompt=args.get("system_prompt") or "You are a careful local assistant. Produce useful draft output.",
            model=args.get("model"),
            temperature=float(args.get("temperature", 0.2)),
            max_tokens=int(args.get("max_tokens", 2048)),
        )
    if name == "summarize_text":
        purpose = args.get("purpose") or "Summarize the material for an engineer who will verify it."
        return _chat(
            tool=name,
            prompt=f"Purpose: {purpose}\n\nText:\n{args['text']}",
            system_prompt="Summarize accurately and compactly. Preserve concrete facts, risks, file names, commands, and unresolved questions. Do not invent details.",
            model=args.get("model"),
            temperature=0.1,
            max_tokens=int(args.get("max_tokens", 1600)),
        )
    if name == "summarize_file":
        content = _load_file(args["path"])
        purpose = args.get("purpose") or "Summarize this file for Codex before deeper inspection."
        return _chat(
            tool=name,
            prompt=f"File: {Path(args['path']).expanduser()}\nPurpose: {purpose}\n\nContent:\n{content}",
            system_prompt="Summarize this file for a software engineer. Include purpose, important APIs, data flow, risks, and exact symbols worth inspecting. Do not claim behavior you cannot infer.",
            model=args.get("model"),
            temperature=0.1,
            max_tokens=int(args.get("max_tokens", 1800)),
        )
    if name == "draft_from_context":
        output_format = args.get("output_format") or "Concise markdown or code, whichever fits the task."
        return _chat(
            tool=name,
            prompt=f"Task:\n{args['task']}\n\nOutput format:\n{output_format}\n\nContext:\n{args['context']}",
            system_prompt="Create a first draft only. Be explicit about assumptions and gaps. Prefer complete, directly usable output over explanation.",
            model=args.get("model"),
            temperature=float(args.get("temperature", 0.3)),
            max_tokens=int(args.get("max_tokens", 4096)),
        )
    if name == "review_diff":
        focus = args.get("focus") or "bugs, regressions, security risks, missing tests, and unclear behavior"
        return _chat(
            tool=name,
            prompt=f"Review focus: {focus}\n\nDiff:\n{args['diff']}",
            system_prompt="You are doing a first-pass code review. Return only concrete findings with file/line references where possible. Separate likely issues from uncertain questions. Avoid style-only comments.",
            model=args.get("model"),
            temperature=0.1,
            max_tokens=int(args.get("max_tokens", 2400)),
        )
    raise ValueError(f"Unknown tool: {name}")


def _handle(request: dict[str, Any]) -> None:
    request_id = request.get("id")
    method = request.get("method")
    params = request.get("params") or {}

    if method == "initialize":
        _result(
            request_id,
            {
                "protocolVersion": params.get("protocolVersion", "2024-11-05"),
                "capabilities": {"tools": {}},
                "serverInfo": {"name": SERVER_NAME, "version": SERVER_VERSION},
            },
        )
        return
    if method == "notifications/initialized":
        return
    if method == "tools/list":
        _result(request_id, {"tools": TOOLS})
        return
    if method == "tools/call":
        try:
            name = params.get("name")
            args = params.get("arguments") or {}
            text = _call_tool(name, args)
            _result(request_id, _text_result(text))
        except Exception as exc:
            _error(request_id, -32000, str(exc))
        return
    _error(request_id, -32601, f"Method not found: {method}")


def main() -> int:
    for line in sys.stdin:
        if not line.strip():
            continue
        try:
            _handle(json.loads(line))
        except Exception as exc:
            _error(None, -32700, f"Invalid request: {exc}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
