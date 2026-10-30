#!/usr/bin/env sh
# Build the C ABI (spec §10.2, paths B and W) to `engine.wasm` and report the size budget (§9.7).
set -eu
cd "$(dirname "$0")"
# The `cdylib` crate type lives in Cargo.toml so a plain cargo build produces `engine.wasm`; the
# `cabi` feature keeps the module out of kernel-only builds.
cargo build --release --lib --target wasm32-unknown-unknown --features cabi
out=target/wasm32-unknown-unknown/release/buildhub_core.wasm
bytes=$(wc -c < "$out")
echo "engine.wasm: $bytes bytes (budget 700 KB for path B)"
if [ "$bytes" -gt 716800 ]; then
  echo "OVER BUDGET" >&2
  exit 1
fi
