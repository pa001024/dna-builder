#!/usr/bin/env python3
"""Locate the fmodel-mcp CLI and run a subcommand.

Thin convenience wrapper so the CLI can be driven from any shell without `uv`
or `dotnet`. It searches, in order:

  1. $FMODEL_CLI_BIN (absolute path override)
  2. <repo>/Cli/bin/publish/fmodel-cli.exe   (published, self-contained)
  3. <repo>/Cli/bin/publish/fmodel-cli.dll   (fallback)

Then runs the binary with the given args, printing its JSON stdout unchanged.
Exits with the CLI's exit code.

Usage:
    python fmodel.py status
    python fmodel.py search "**/MI_*"
    python fmodel.py export-tex "EM/Content/Textures/T_Albedo"
"""
from __future__ import annotations

import os
import subprocess
import sys
from pathlib import Path

# Repo root = three levels up from this script (skill dir -> skills -> .workbuddy -> repo? no)
# scripts/fmodel.py lives in the skill; the fmodel-mcp repo is elsewhere. Resolve via env
# or a default known checkout path, overridable with FMODEL_REPO.
REPO = Path(os.environ.get("FMODEL_REPO", r"D:\dev\fmodel-mcp")).resolve()


def _find_bin() -> Path | None:
    override = os.environ.get("FMODEL_CLI_BIN")
    if override:
        p = Path(override)
        return p if p.exists() else None
    candidates = [
        REPO / "Cli" / "bin" / "publish" / "fmodel-cli.exe",
        REPO / "Cli" / "bin" / "publish" / "fmodel-cli.dll",
    ]
    for c in candidates:
        if c.exists():
            return c
    return None


def main() -> int:
    if len(sys.argv) < 2:
        print("usage: fmodel.py <subcommand> [args...]", file=sys.stderr)
        return 2
    bin_path = _find_bin()
    if bin_path is None:
        print(f"fmodel-cli binary not found under {REPO}. Set FMODEL_REPO or FMODEL_CLI_BIN.",
              file=sys.stderr)
        return 1

    cmd = [str(bin_path), *sys.argv[1:]] if bin_path.suffix.lower() == ".exe" \
        else ["dotnet", "exec", str(bin_path), *sys.argv[1:]]

    proc = subprocess.run(cmd, cwd=str(bin_path.parent))
    return proc.returncode


if __name__ == "__main__":
    raise SystemExit(main())
