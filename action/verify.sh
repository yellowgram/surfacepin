#!/usr/bin/env bash
# SurfacePin Action verify step.
# File mode (backward compatible):
#   SURFACEPIN_TOOLS_PATH + SURFACEPIN_LOCKFILE
#     -> surfacepin verify [--surface …] <tools> <lock>
# Live stdio:
#   SURFACEPIN_SERVER_COMMAND [+ SURFACEPIN_SERVER_ARGS] + SURFACEPIN_LOCKFILE
#     -> surfacepin verify --stdio [--surface …] <lock> -- <command> [args…]
# SURFACEPIN_BIN is either a path to cli.js (run with node) or a PATH command.
set -euo pipefail

if [[ -z "${SURFACEPIN_BIN:-}" ]]; then
  echo "error: SURFACEPIN_BIN is not set" >&2
  exit 2
fi

if [[ -z "${SURFACEPIN_LOCKFILE:-}" ]]; then
  echo "error: lockfile-path is required" >&2
  exit 2
fi

tools="${SURFACEPIN_TOOLS_PATH:-}"
cmd="${SURFACEPIN_SERVER_COMMAND:-}"
surface="${SURFACEPIN_SURFACE:-}"

if [[ -n "$cmd" && -n "$tools" ]]; then
  echo "error: set tools-path (file mode) or server-command (stdio mode), not both" >&2
  exit 2
fi

if [[ "$SURFACEPIN_BIN" == */* || -f "$SURFACEPIN_BIN" ]]; then
  runner=(node "$SURFACEPIN_BIN")
else
  runner=("$SURFACEPIN_BIN")
fi

if [[ -n "$cmd" ]]; then
  server_args=()
  raw="${SURFACEPIN_SERVER_ARGS:-}"
  if [[ -n "$raw" ]]; then
    if [[ "$raw" == *$'\n'* ]]; then
      while IFS= read -r line || [[ -n "$line" ]]; do
        line="${line%$'\r'}"
        [[ -z "$line" ]] && continue
        server_args+=("$line")
      done <<<"$raw"
    else
      # Intentional IFS split for simple argv (no embedded spaces).
      # shellcheck disable=SC2206
      server_args=($raw)
    fi
  fi
  args=(verify --stdio)
  if [[ -n "$surface" ]]; then
    args+=(--surface "$surface")
  fi
  args+=("$SURFACEPIN_LOCKFILE" -- "$cmd")
  if [[ ${#server_args[@]} -gt 0 ]]; then
    args+=("${server_args[@]}")
  fi
  exec "${runner[@]}" "${args[@]}"
fi

if [[ -n "$tools" ]]; then
  args=(verify)
  if [[ -n "$surface" ]]; then
    args+=(--surface "$surface")
  fi
  args+=("$tools" "$SURFACEPIN_LOCKFILE")
  exec "${runner[@]}" "${args[@]}"
fi

echo "error: tools-path or server-command is required" >&2
exit 2
