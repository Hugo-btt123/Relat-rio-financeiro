-- CreateEnum
CREATE TYPE "Papel" AS ENUM ('administrador', 'funcionario');

-- CreateEnum
CREATE TYPE "StatusDebito" AS ENUM ('aberto', 'cobrado', 'pago', 'cancelado');

-- CreateEnum
CREATE TYPE "StatusNotinha" AS ENUM ('ativa', 'paga', 'estornada');

-- CreateTable
CREATE TABLE "Usuario" (
    "id" SERIAL NOT NULL,
    "nome" TEXT NOT NULL,
    "login" TEXT NOT NULL,
    "senha" TEXT NOT NULL,
    "papel" "Papel" NOT NULL DEFAULT 'funcionario',
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Usuario_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Cliente" (
    "id" SERIAL NOT NULL,
    "nome" TEXT NOT NULL,
    "cpf" TEXT,
    "telefone" TEXT,
    "observacoes" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ativo',
    "honorarioEscritorio" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Cliente_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Propriedade" (
    "id" SERIAL NOT NULL,
    "clienteId" INTEGER NOT NULL,
    "nome" TEXT NOT NULL,
    "documento" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ativo',
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Propriedade_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notinha" (
    "id" SERIAL NOT NULL,
    "clienteId" INTEGER NOT NULL,
    "competencia" TEXT NOT NULL,
    "observacoes" TEXT,
    "total" DECIMAL(12,2) NOT NULL,
    "status" "StatusNotinha" NOT NULL DEFAULT 'ativa',
    "creditoAdiantado" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "creditoPixPendente" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoPor" TEXT,

    CONSTRAINT "Notinha_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Debito" (
    "id" SERIAL NOT NULL,
    "clienteId" INTEGER NOT NULL,
    "propriedadeId" INTEGER,
    "descricao" TEXT NOT NULL,
    "valor" DECIMAL(12,2) NOT NULL,
    "competencia" TEXT NOT NULL,
    "observacao" TEXT,
    "status" "StatusDebito" NOT NULL DEFAULT 'aberto',
    "notinhaId" INTEGER,
    "competenciaNotinha" TEXT,
    "pixPendente" BOOLEAN NOT NULL DEFAULT false,
    "formaPagamento" TEXT,
    "dataPagamento" DATE,
    "obsPagamento" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoPor" TEXT,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Debito_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Pagamento" (
    "id" SERIAL NOT NULL,
    "notinhaId" INTEGER NOT NULL,
    "valor" DECIMAL(12,2) NOT NULL,
    "forma" TEXT NOT NULL,
    "data" DATE,
    "obs" TEXT,
    "tipo" TEXT NOT NULL,
    "pix" BOOLEAN NOT NULL DEFAULT false,
    "confirmado" BOOLEAN NOT NULL DEFAULT true,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Pagamento_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Historico" (
    "id" SERIAL NOT NULL,
    "quando" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "entidade" TEXT NOT NULL,
    "entidadeId" TEXT,
    "entidadeLabel" TEXT,
    "acao" TEXT NOT NULL,
    "operador" TEXT,
    "detalhes" TEXT,
    "clienteId" INTEGER,

    CONSTRAINT "Historico_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Usuario_login_key" ON "Usuario"("login");

-- AddForeignKey
ALTER TABLE "Propriedade" ADD CONSTRAINT "Propriedade_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "Cliente"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notinha" ADD CONSTRAINT "Notinha_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "Cliente"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Debito" ADD CONSTRAINT "Debito_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "Cliente"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Debito" ADD CONSTRAINT "Debito_propriedadeId_fkey" FOREIGN KEY ("propriedadeId") REFERENCES "Propriedade"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Debito" ADD CONSTRAINT "Debito_notinhaId_fkey" FOREIGN KEY ("notinhaId") REFERENCES "Notinha"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Pagamento" ADD CONSTRAINT "Pagamento_notinhaId_fkey" FOREIGN KEY ("notinhaId") REFERENCES "Notinha"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Historico" ADD CONSTRAINT "Historico_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "Cliente"("id") ON DELETE SET NULL ON UPDATE CASCADE;
