import js from "@eslint/js";
import tseslint from "typescript-eslint";

const rawSqlBan = {
  selector:
    "MemberExpression[property.name=/^\\$(queryRaw|queryRawUnsafe|executeRaw|executeRawUnsafe)$/]",
  message:
    "Raw SQL ($queryRaw/$executeRaw and *Unsafe variants) is banned outside adapters/db/ — AD-1 (ARCHITECTURE-SPINE.md) requires all data access to go through the firmId-scoped repository layer.",
};

export default tseslint.config(
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    ignores: ["node_modules/**", ".next/**", "generated/**"],
  },
  {
    rules: {
      "no-restricted-syntax": ["error", rawSqlBan],
    },
  },
  {
    // The one place raw SQL — if ever needed — is allowed to live.
    files: ["adapters/db/**"],
    rules: {
      "no-restricted-syntax": "off",
    },
  },
);
