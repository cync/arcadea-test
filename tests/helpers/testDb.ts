import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { PrismaPGlite } from "pglite-prisma-adapter";
import { PrismaClient } from "../../generated/prisma/client";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const migrationsDir = path.join(__dirname, "../../prisma/migrations");

/**
 * Applies every migration in prisma/migrations, in directory order, to a
 * fresh in-memory PGlite instance — not just the first one. Every test file
 * that needs a real (embedded) database calls this, so a new migration
 * (like this story's) never silently goes untested by earlier stories' tests.
 */
function loadAllMigrationSql(): string {
  const entries = readdirSync(migrationsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();

  return entries
    .map((dir) => readFileSync(path.join(migrationsDir, dir, "migration.sql"), "utf-8"))
    .join("\n");
}

const migrationSql = loadAllMigrationSql();

export async function createTestClient(): Promise<PrismaClient> {
  const pglite = new PGlite();
  await pglite.exec(migrationSql);
  const adapter = new PrismaPGlite(pglite);
  return new PrismaClient({ adapter });
}
