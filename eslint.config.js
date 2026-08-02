// ESLint flat config — Node.js (src, netlify, scripts, tests).
// Regras intencionalmente leves para o código legado; erros bloqueiam o build.
"use strict";

module.exports = [
  {
    files: ["**/*.js"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "commonjs",
      globals: {
        require: "readonly",
        module: "readonly",
        exports: "readonly",
        process: "readonly",
        console: "readonly",
        Buffer: "readonly",
        __dirname: "readonly",
        __filename: "readonly",
        URL: "readonly",
        setTimeout: "readonly",
        clearTimeout: "readonly",
        setInterval: "readonly",
        clearInterval: "readonly",
        fetch: "readonly",
      },
    },
    rules: {
      "no-undef": "error",
      "no-unused-vars": ["warn", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
      "no-unreachable": "error",
      "no-constant-condition": "warn",
      "no-dupe-keys": "error",
      "no-extra-semi": "error",
      "no-mixed-spaces-and-tabs": "error",
      "no-redeclare": "error",
    },
  },
  {
    files: ["tests/**/*.js"],
    languageOptions: {
      globals: {
        before: "readonly",
        after: "readonly",
        test: "readonly",
        describe: "readonly",
        it: "readonly",
      },
    },
  },
];
