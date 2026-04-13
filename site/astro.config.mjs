import { defineConfig } from "astro/config"

const base = process.env.BASE_PATH || "/"

export default defineConfig({
  output: "static",
  base
})
