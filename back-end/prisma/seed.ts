import "dotenv/config";
import bcrypt from "bcryptjs";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client.js";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL não definida");

const adapter = new PrismaPg({ connectionString });
const prisma = new PrismaClient({ adapter });

async function main() {
  const senhaAdminHash = await bcrypt.hash("admin123", 10);
  await prisma.usuario.upsert({
    where: { login: "admin" },
    update: {},
    create: {
      nome: "Administrador",
      login: "admin",
      senha: senhaAdminHash,
      papel: "administrador",
    },
  });
  console.log("Usuário admin criado/confirmado (login: admin / senha: admin123).");

  const senhaFuncionarioHash = await bcrypt.hash("123456", 10);
  await prisma.usuario.upsert({
    where: { login: "funcionario" },
    update: {},
    create: {
      nome: "Funcionário Teste",
      login: "funcionario",
      senha: senhaFuncionarioHash,
      papel: "funcionario",
    },
  });
  console.log("Usuário funcionario criado/confirmado (login: funcionario / senha: 123456).");
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
