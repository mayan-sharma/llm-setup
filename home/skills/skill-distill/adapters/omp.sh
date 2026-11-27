#!/usr/bin/env bash
# oh-my-pi. MODEL like local/deepseek-v4.1-flash (provider/id from ~/.omp/agent/models.yml)
set -uo pipefail
mkdir -p "$TRACE_DIR/sessions"
omp -p --cwd "$WORKSPACE" --model "$MODEL" --session-dir "$TRACE_DIR/sessions" \
    --auto-approve --no-context-files --no-rules --no-skills --no-title ${STUDENT_ARGS:-} \
    "$(cat "$PROMPT_FILE")"
rc=$?
f=$(ls -t "$TRACE_DIR"/sessions/*.jsonl "$TRACE_DIR"/sessions/*/*.jsonl 2>/dev/null | head -1)
[ -n "$f" ] && cp "$f" "$TRACE_DIR/session.jsonl"
exit $rc
