#!/usr/bin/env bash
# pi coding agent. MODEL like provider/id
set -uo pipefail
mkdir -p "$TRACE_DIR/sessions"
cd "$WORKSPACE" || exit 2
pi -p --model "$MODEL" --session-dir "$TRACE_DIR/sessions" --no-skills ${STUDENT_ARGS:-} "$(cat "$PROMPT_FILE")"
rc=$?
f=$(ls -t "$TRACE_DIR"/sessions/*.jsonl "$TRACE_DIR"/sessions/*/*.jsonl 2>/dev/null | head -1)
[ -n "$f" ] && cp "$f" "$TRACE_DIR/session.jsonl"
exit $rc
