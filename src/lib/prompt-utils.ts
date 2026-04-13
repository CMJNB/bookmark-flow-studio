import {
  DEFAULT_HASH_PROMPT_TEMPLATE,
  DEFAULT_INCREMENTAL_PROMPT_TEMPLATE,
  DEFAULT_URL_PROMPT_TEMPLATE
} from "../prompts/templates"
import type { ExportNode } from "../types/bookmark"

export const DEFAULT_PROMPT_TEMPLATE = DEFAULT_URL_PROMPT_TEMPLATE
export { DEFAULT_HASH_PROMPT_TEMPLATE, DEFAULT_INCREMENTAL_PROMPT_TEMPLATE }

function yamlScalar(text: string): string {
  const escaped = text.replace(/\\/g, "\\\\").replace(/\"/g, "\\\"").replace(/\n/g, "\\n")
  return `"${escaped}"`
}

export function toYaml(nodes: ExportNode[], indent = 0): string {
  const sp = "  ".repeat(indent)
  let out = ""

  for (const node of nodes) {
    out += `${sp}- title: ${yamlScalar(node.title)}\n`
    if (node.url) {
      out += `${sp}  url: ${yamlScalar(node.url)}\n`
    }
    if (node.children?.length) {
      out += `${sp}  children:\n`
      out += toYaml(node.children, indent + 2)
    }
  }

  return out
}

function indentYaml(yamlData: string): string {
  return yamlData
    .split("\n")
    .map((line) => (line ? `  ${line}` : line))
    .join("\n")
}

export function buildAiPrompt(yamlData: string, templateContent = DEFAULT_PROMPT_TEMPLATE): string {
  return templateContent
    .replaceAll("{{YAML_DATA}}", yamlData)
    .replaceAll("{{YAML_DATA_INDENTED}}", indentYaml(yamlData))
}

export function buildHashAiPrompt(
  yamlHashData: string,
  templateContent = DEFAULT_HASH_PROMPT_TEMPLATE
): string {
  return templateContent
    .replaceAll("{{YAML_HASH_DATA}}", yamlHashData)
    .replaceAll("{{YAML_HASH_DATA_INDENTED}}", indentYaml(yamlHashData))
}

export function buildIncrementalAiPrompt(
  setAData: string,
  setBData: string,
  setAMode: "url" | "hash",
  setBMode: "url" | "hash",
  templateContent = DEFAULT_INCREMENTAL_PROMPT_TEMPLATE
): string {
  return templateContent
    .replaceAll("{{SET_A_MODE}}", setAMode)
    .replaceAll("{{SET_B_MODE}}", setBMode)
    .replaceAll("{{SET_A_DATA}}", setAData)
    .replaceAll("{{SET_A_DATA_INDENTED}}", indentYaml(setAData))
    .replaceAll("{{SET_B_DATA}}", setBData)
    .replaceAll("{{SET_B_DATA_INDENTED}}", indentYaml(setBData))
}
