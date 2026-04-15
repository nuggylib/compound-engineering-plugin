#!/usr/bin/env bun
import path from "path"
import { validateReleasePleaseConfig } from "../../src/release/config"
import { getCompoundEngineeringCounts, syncReleaseMetadata } from "../../src/release/metadata"
import { runTokenGuardrails } from "../../src/release/token-guardrails"
import { readJson } from "../../src/utils/files"

type ReleasePleaseManifest = Record<string, string>

const releasePleaseConfig = await readJson<{ packages: Record<string, unknown> }>(
  path.join(process.cwd(), ".github", "release-please-config.json"),
)
const manifest = await readJson<ReleasePleaseManifest>(
  path.join(process.cwd(), ".github", ".release-please-manifest.json"),
)
const configErrors = validateReleasePleaseConfig(releasePleaseConfig)
const counts = await getCompoundEngineeringCounts(process.cwd())
const result = await syncReleaseMetadata({
  write: false,
  componentVersions: {
    marketplace: manifest[".claude-plugin"],
    "cursor-marketplace": manifest[".cursor-plugin"],
  },
})
const changed = result.updates.filter((update) => update.changed)
const metadataErrors = result.errors

const pluginRoot = path.join(process.cwd(), "plugins", "compound-engineering")
const guardrails = await runTokenGuardrails(pluginRoot)

if (configErrors.length === 0 && changed.length === 0 && metadataErrors.length === 0 && guardrails.errors.length === 0) {
  const pct = Math.round((guardrails.budgetUsage.current / guardrails.budgetUsage.limit) * 100)
  console.log(
    `Release metadata is in sync. compound-engineering currently has ${counts.agents} agents, ${counts.skills} skills, and ${counts.mcpServers} MCP server${counts.mcpServers === 1 ? "" : "s"}.`,
  )
  console.log(
    `Always-loaded budget: ${guardrails.budgetUsage.current.toLocaleString()}/${guardrails.budgetUsage.limit.toLocaleString()} chars (${pct}%)`,
  )
  if (guardrails.warnings.length > 0) {
    for (const warning of guardrails.warnings) {
      console.error(`  ${warning}`)
    }
  }
  process.exit(0)
}

if (configErrors.length > 0) {
  console.error("Release configuration errors detected:")
  for (const error of configErrors) {
    console.error(`- ${error}`)
  }
}

if (metadataErrors.length > 0) {
  console.error("Release metadata structural errors detected:")
  for (const error of metadataErrors) {
    console.error(`- ${error}`)
  }
}

if (changed.length > 0) {
  console.error("Release metadata drift detected:")
  for (const update of changed) {
    console.error(`- ${update.path}`)
  }
  console.error(
    `Current compound-engineering counts: ${counts.agents} agents, ${counts.skills} skills, ${counts.mcpServers} MCP server${counts.mcpServers === 1 ? "" : "s"}.`,
  )
}

if (guardrails.errors.length > 0) {
  console.error("Token guardrail violations:")
  for (const error of guardrails.errors) {
    console.error(`  ${error}`)
  }
}

if (guardrails.warnings.length > 0) {
  for (const warning of guardrails.warnings) {
    console.error(`  ${warning}`)
  }
}

process.exit(1)
