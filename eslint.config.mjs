import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    settings: {
      // Provide explicit React version so eslint-plugin-react skips auto-detection.
      // Auto-detection calls context.getFilename() which was removed in ESLint 10.
      react: { version: "19.2.5" },
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "coverage/**",
    "src-tauri/target/**",
    "next-env.d.ts",
    // Git worktrees should not be linted from the root project.
    ".worktrees/**",
  ]),
]);

export default eslintConfig;
