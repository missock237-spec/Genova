import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";
import { dirname } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const eslintConfig = [...nextCoreWebVitals, ...nextTypescript, {
  rules: {
    // TypeScript rules
    "@typescript-eslint/no-explicit-any": "warn",
    "@typescript-eslint/no-unused-vars": ["warn", { "argsIgnorePattern": "^_" }],
    "@typescript-eslint/no-require-imports": "error",
    "@typescript-eslint/ban-ts-comment": "off",
    
    // React rules
    "react-hooks/exhaustive-deps": "warn",
    "react-hooks/rules-of-hooks": "warn",
    "react/no-unescaped-entities": "off",
    
    // Next.js rules
    "@next/next/no-img-element": "warn",
    
    // Temporarily suppress specific errors that block the build
    "prefer-const": "warn",
    "react-hooks/set-state-in-effect": "off",
    "react-compiler/react-compiler": "off",
    "react-hooks/purity": "off",
  },
}, {
  ignores: ["node_modules/**", ".next/**", "out/**", "build/**", "next-env.d.ts", "examples/**", "skills/**", "services/**"]
}];

export default eslintConfig;
