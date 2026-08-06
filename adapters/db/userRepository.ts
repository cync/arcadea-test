import type { User, Role } from "../../domain/User";
import type { UserRepository } from "../../application/MatterOnboarding";
import { firmScopedClient } from "./prisma";

export class PrismaUserRepository implements UserRepository {
  constructor(private readonly firmId: string) {}

  async findById(id: string): Promise<User | null> {
    const client = firmScopedClient(this.firmId);
    const user = await client.user.findFirst({ where: { id } });
    return user as User | null;
  }

  async findByRole(role: Role): Promise<User[]> {
    const client = firmScopedClient(this.firmId);
    const users = await client.user.findMany({ where: { role } });
    return users as User[];
  }
}
