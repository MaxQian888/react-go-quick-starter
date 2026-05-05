import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import { defineConfig, globalIgnores } from "eslint/config";

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
  // shadcn/ui ships components vendored into the repo via `pnpm dlx shadcn add`.
  // They predate React 19.2 strict rules; suppressing here is safer than
  // hand-patching them, since the next shadcn upgrade would clobber inline
  // disables. Same applies to hooks/use-mobile.ts which is vendored from shadcn.
  {
    files: ["components/ui/**", "hooks/use-mobile.ts"],
    rules: {
      "react-hooks/set-state-in-effect": "off",
      "react-hooks/purity": "off",
      "@typescript-eslint/no-unused-vars": "off",
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
