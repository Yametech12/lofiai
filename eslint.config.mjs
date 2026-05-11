import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
  {
    files: ["**/*.{js,jsx,ts,tsx}"],
    rules: {
      // Allow inline styles for dynamic values (e.g., progress width)
      "react/style-prop-object": "off",
      "@next/next/no-inline-styles": "off",
    },
  },
  // Try to find and suppress any other possible rule name
  {
    rules: {
      "no-inline-styles": "off",
      "no-style-prop-object": "off",
      "stylistic/no-inline": "off",
    },
  },
]);

export default eslintConfig;
