#!/usr/bin/env bash
# opencode. MODEL like provider/model from your opencode config.
set -uo pipefail
opencode run --dir "$WORKSPACE" --format json --auto ${MODEL:+-m "$MODEL"} ${STUDENT_ARGS:-} "$(cat "$PROMPT_FILE")" \
  | tee "$TRACE_DIR/session.jsonl"
exit ${PIPESTATUS[0]}
