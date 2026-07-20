import js from "@eslint/js";
import globals from "globals";
import react from "eslint-plugin-react";
import reactHooks from "eslint-plugin-react-hooks";

/**
 * Flat ESLint config. Pragmatic baseline for a codebase that was previously
 * unlinted: correctness rules are errors, stylistic noise is relaxed. Tighten
 * over time (e.g. promote unused-vars and exhaustive-deps to errors).
 */
export default [
  {
    ignores: [
      "dist/**",
      "build/**",
      "release/**",
      ".artifacts/**",
      "node_modules/**",
      ".notes-app/**",
      ".versions/**",
      "docs-site-dist/**",
      "docs-site/**",
      "docs-site/.vitepress/theme/tokens.css"
    ]
  },

  js.configs.recommended,

  // Harmless pre-existing escape style across the (previously unlinted) codebase.
  // Keep as a warning rather than blocking CI; clean up opportunistically.
  {
    rules: { "no-useless-escape": "warn" }
  },

  // Renderer (React) source — browser environment, ESM modules.
  {
    files: ["src/**/*.{js,jsx}"],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: "module",
      parserOptions: { ecmaFeatures: { jsx: true } },
      globals: { ...globals.browser, ...globals.worker }
    },
    plugins: { react, "react-hooks": reactHooks },
    settings: { react: { version: "detect" } },
    rules: {
      ...react.configs.recommended.rules,
      ...reactHooks.configs.recommended.rules,
      "react/react-in-jsx-scope": "off",
      "react/prop-types": "off",
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",
      "no-unused-vars": ["warn", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }]
    }
  },

  // AI subsystem — CommonJS, runs in the Electron main (Node) process.
  {
    files: ["ai/**/*.js"],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: "commonjs",
      globals: { ...globals.node }
    },
    rules: {
      "no-unused-vars": ["warn", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }]
    }
  },

  // Electron main/preload and build scripts — CommonJS, Node environment.
  {
    files: ["electron/**/*.{js,cjs}", "scripts/**/*.{js,cjs}", "*.cjs"],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: "commonjs",
      globals: { ...globals.node }
    },
    rules: {
      "no-unused-vars": ["warn", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }]
    }
  },

  // ESM config files (vite, eslint) — Node environment, module syntax.
  {
    files: ["*.config.js", "*.config.mjs", "vite.config.js"],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: "module",
      globals: { ...globals.node }
    }
  },

  // Test files — Vitest globals plus jsdom browser environment.
  {
    files: ["**/*.test.{js,jsx,cjs}", "**/*.spec.{js,jsx,cjs}"],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: "module",
      parserOptions: { ecmaFeatures: { jsx: true } },
      globals: {
        ...globals.browser,
        ...globals.node,
        vi: "readonly",
        describe: "readonly",
        it: "readonly",
        test: "readonly",
        expect: "readonly",
        beforeEach: "readonly",
        afterEach: "readonly",
        beforeAll: "readonly",
        afterAll: "readonly"
      }
    },
    plugins: { react, "react-hooks": reactHooks },
    settings: { react: { version: "detect" } },
    rules: {
      "no-unused-vars": "off"
    }
  }
];
