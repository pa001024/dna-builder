#!/usr/bin/env bun

process.env.UI_FRAME_KIND = "head"
await import("./import-title-frame")
