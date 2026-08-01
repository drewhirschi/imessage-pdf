import { dirname } from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

const eslintConfig = [
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  {
    ignores: [
      "node_modules/**",
      ".next/**",
      ".next-dev/**",
      "out/**",
      "build/**",
      "dist-electron/**",
      ".demo/**",
      "next-env.d.ts",
      ".claude/**",
      ".gstack/**",
    ],
  },
  {
    // The Electron main/preload/server code is CommonJS by necessity (Electron
    // main runs as CJS), so require() and Node globals are expected there.
    files: ["electron/**/*.js"],
    rules: {
      "@typescript-eslint/no-require-imports": "off",
    },
  },
];

export default eslintConfig;
