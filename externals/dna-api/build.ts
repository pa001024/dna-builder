await Bun.build({
    entrypoints: ["./src/index.ts"],
    outdir: "./dist",
    minify: true,
    target: "browser",
    sourcemap: "external",
    external: ["node-forge"],
})

export {}
