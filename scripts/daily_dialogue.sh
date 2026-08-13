#!/bin/bash
set -e
cd "/Users/ericosilitonga/Projects/Personal/MonikAI"
PROMPT="$(cat "$(dirname "$0")/daily_dialogue_prompt.txt")"
/Users/ericosilitonga/.local/bin/claude -p "$PROMPT" \
  --allowedTools "Bash,Read,Write,Edit,Grep,Glob,WebSearch" \
  --permission-mode acceptEdits
