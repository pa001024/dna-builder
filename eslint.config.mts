import { defineConfig } from "eslint/config"
import vue from "eslint-plugin-vue"
import vueParser from "vue-eslint-parser"
import typescriptEslint from "@typescript-eslint/parser"
import tseslint from "typescript-eslint"
import prettier from "eslint-plugin-prettier/recommended"

export default defineConfig([
    {
        ignores: ["**/node_modules/**/*", "**/dist/**/*", "**/public/**/*", "**/types/**/*.d.ts"],
        files: ["**/*.ts", "**/*.tsx", "**/*.vue", "**/*.js", "**/*.jsx", "**/*.cjs"],
    },
    ...vue.configs["flat/recommended"],
    prettier,
    ...tseslint.configs.recommended,
    {
        files: ["**/*.vue"],
        languageOptions: {
            parser: vueParser,
            parserOptions: {
                parser: typescriptEslint,
                sourceType: "module",
                jsx: true,
            },
        },
    },
    {
        rules: {
            "vue/multi-word-component-names": "off",
            "vue/require-default-prop": "off",
            "vue/no-v-html": "off",
            "vue/no-use-v-if-with-v-for": "off",
            "@typescript-eslint/no-explicit-any": "off",
            "@typescript-eslint/no-empty-object-type": "off",
            "@typescript-eslint/no-namespace": "off",
            "@typescript-eslint/no-unused-vars": [
                "error",
                {
                    args: "all",
                    argsIgnorePattern: "^_",
                    caughtErrors: "all",
                    caughtErrorsIgnorePattern: "^_",
                    destructuredArrayIgnorePattern: "^_",
                    varsIgnorePattern: "^_",
                    ignoreRestSiblings: true,
                },
            ],
        },
    },
])
