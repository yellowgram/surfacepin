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
clean_env="${SURFACEPIN_CLEAN_ENV:-false}"
env_allow="${SURFACEPIN_ENV_ALLOW:-}"

if [[ "$clean_env" != "true" && "$clean_env" != "false" ]]; then
  echo "error: clean-env must be true or false" >&2
  exit 2
fi
if [[ -z "$cmd" && ( "$clean_env" == "true" || -n "$env_allow" ) ]]; then
  echo "error: clean-env and env-allow only apply with server-command (stdio mode)" >&2
  exit 2
fi

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
      # Whitespace split for simple argv (no embedded spaces). Globbing is
      # off so an argument like '*.json' reaches the server unexpanded.
      set -f
      # shellcheck disable=SC2206
      server_args=($raw)
      set +f
    fi
  fi
  args=(verify --stdio)
  if [[ -n "$surface" ]]; then
    args+=(--surface "$surface")
  fi
  if [[ "$clean_env" == "true" ]]; then
    args+=(--clean-env)
  fi
  if [[ -n "$env_allow" ]]; then
    args+=(--env-allow "$env_allow")
  fi
  args+=("$SURFACEPIN_LOCKFILE" -- "$cmd")
  if [[ ${#server_args[@]} -gt 0 ]]; then
    args+=("${server_args[@]}")
  fi
elif [[ -n "$tools" ]]; then
  args=(verify)
  if [[ -n "$surface" ]]; then
    args+=(--surface "$surface")
  fi
  args+=("$tools" "$SURFACEPIN_LOCKFILE")
else
  echo "error: tools-path or server-command is required" >&2
  exit 2
fi

# The report quotes text the MCP server controls. Stop GitHub from reading
# workflow commands (::error::, ::add-mask:: ...) out of it while it prints.
in_actions=false
if [[ "${GITHUB_ACTIONS:-}" == "true" ]]; then
  in_actions=true
  token="surfacepin-$(od -An -tx1 -N16 /dev/urandom | tr -d ' \n')"
  echo "::stop-commands::${token}"
fi

report="$(mktemp)"
set +e
"${runner[@]}" "${args[@]}" 2>&1 | tee "$report"
status=${PIPESTATUS[0]}
set -e

if [[ "$in_actions" == "true" ]]; then
  echo "::${token}::"
fi

# Workflow-command escaping: % CR LF in messages; also : and , in properties.
esc_msg() { local s="${1//%/%25}"; s="${s//$'\r'/%0D}"; printf '%s' "${s//$'\n'/%0A}"; }
esc_prop() { local s; s="$(esc_msg "$1")"; s="${s//:/%3A}"; printf '%s' "${s//,/%2C}"; }
html_esc() { sed -e 's/&/\&amp;/g' -e 's/</\&lt;/g' -e 's/>/\&gt;/g'; }

if [[ "$in_actions" == "true" ]]; then
  lock_disp="$(printf '%s' "$SURFACEPIN_LOCKFILE" | html_esc)"
  if [[ $status -eq 1 ]]; then
    added=$(grep -cE '^ADDED ' "$report" || true)
    removed=$(grep -cE '^REMOVED ' "$report" || true)
    changed=$(grep -cE '^CHANGED ' "$report" || true)
    msg="The MCP surface no longer matches ${SURFACEPIN_LOCKFILE}: ${added} added, ${removed} removed, ${changed} changed. See the job summary for the field-level diff. If the change is intended, review it, re-run surfacepin lock and commit the lockfile."
    # Annotation paths are relative to the repository root, not working-directory.
    ann_file="$SURFACEPIN_LOCKFILE"
    wd="${SURFACEPIN_WORKDIR:-.}"
    if [[ "$ann_file" != /* && -n "$wd" && "$wd" != "." ]]; then
      ann_file="${wd%/}/${ann_file#./}"
    fi
    echo "::error file=$(esc_prop "$ann_file"),title=SurfacePin drift::$(esc_msg "$msg")"
    if [[ -n "${GITHUB_STEP_SUMMARY:-}" ]]; then
      {
        echo "### SurfacePin: drift against <code>${lock_disp}</code>"
        echo
        echo "${added} added, ${removed} removed, ${changed} changed. Labels (COMPATIBLE, BREAKING, HINT_FLIP) describe compatibility for callers, not safety."
        echo
        echo "<pre>"
        html_esc <"$report"
        echo "</pre>"
      } >>"$GITHUB_STEP_SUMMARY"
    fi
  elif [[ $status -eq 0 && -n "${GITHUB_STEP_SUMMARY:-}" ]]; then
    echo "### SurfacePin: surface matches <code>${lock_disp}</code>" >>"$GITHUB_STEP_SUMMARY"
  elif [[ $status -ne 0 ]]; then
    echo "::error title=SurfacePin error::$(esc_msg "surfacepin verify could not run (exit ${status}). See the step log.")"
  fi
fi

rm -f "$report"
exit "$status"
