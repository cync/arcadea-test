import { PrismaClient } from "../generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

// Dev-only seed: exactly one Firm row (no UI/API creates a Firm in v1 —
// ARCHITECTURE-SPINE.md Deferred: "Firm-provisioning process/tool") plus one
// User so there's a real Attorney of Record to assign Documents to.
async function main() {
  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
  const prisma = new PrismaClient({ adapter });

  const existing = await prisma.firm.findFirst();
  if (existing) {
    console.log(`Firm already seeded: ${existing.id} (${existing.name})`);
    return;
  }

  const firm = await prisma.firm.create({ data: { name: "Docket Dev Firm" } });
  console.log(`Seeded Firm: ${firm.id} (${firm.name})`);

  const attorney = await prisma.user.create({
    data: { firmId: firm.id, name: "Dev Attorney", email: "attorney@docket.dev", role: "ATTORNEY_OF_RECORD" },
  });
  console.log(`Seeded User: ${attorney.id} (${attorney.name})`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
