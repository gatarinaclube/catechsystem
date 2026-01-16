import "dotenv/config"; // <- ADICIONE ESSA LINHA
import { defineConfig } from "@prisma/config";

export default defineConfig({
  schema: "./prisma/schema.prisma",
});
