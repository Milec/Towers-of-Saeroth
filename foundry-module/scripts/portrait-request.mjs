#!/usr/bin/env node
import { readdir, readFile } from "node:fs/promises";
import { basename, dirname, extname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const moduleDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repositoryDir = resolve(moduleDir, "..");
const campaignDir = join(repositoryDir, "campaign");

function unquote(value) {
  return value.replace(/^(?:"([\s\S]*)"|'([\s\S]*)')$/, "$1$2").trim();
}

function parseFrontmatter(source, path) {
  const match = source.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n/);
  if (!match) throw new Error(`${path}: missing frontmatter.`);
  const fields = Object.fromEntries(
    match[1]
      .split(/\r?\n/)
      .filter(Boolean)
      .map((line) => {
        const separator = line.indexOf(":");
        return [line.slice(0, separator).trim(), line.slice(separator + 1).trim()];
      }),
  );
  if (!fields.title || !["creature", "npc"].includes(fields.type)) {
    throw new Error(`${path}: requires title and type: creature or type: npc.`);
  }
  if (!/```pf2e-stats/i.test(source)) throw new Error(`${path}: no pf2e-stats block.`);
  return fields;
}

function portraitPath(source, notePath) {
  const markdownImage = source.match(/!\[[\s\S]*?\]\(([^)]+)\)/);
  if (!markdownImage) return null;
  const imagePath = resolve(dirname(notePath), markdownImage[1].trim());
  const campaignRelative = relative(campaignDir, imagePath);
  if (campaignRelative.startsWith("..") || resolve(campaignDir, campaignRelative) !== imagePath) {
    throw new Error(`${notePath}: portrait must be stored beneath campaign/.`);
  }
  return imagePath;
}

function promptRequest(fields, notePath) {
  const title = unquote(fields.title);
  const concept = unquote(fields["portrait-prompt"] ?? "");
  if (!concept) {
    throw new Error(`${notePath}: add a one-line portrait-prompt field before requesting an image.`);
  }
  const outputName = `${basename(notePath, extname(notePath))} portrait.png`;
  return {
    status: "ready-for-image-generation",
    source: relative(repositoryDir, notePath).replaceAll("\\", "/"),
    output: relative(repositoryDir, join(dirname(notePath), outputName)).replaceAll("\\", "/"),
    markdown: `![Portrait of ${title}](${outputName})`,
    prompt: [
      "Use case: stylized-concept.",
      "Asset type: square Foundry VTT NPC or monster portrait and token art.",
      `Subject: ${concept}`,
      "Composition: centered character or creature, readable silhouette, enough padding for a circular or square token crop.",
      "Style: polished dark-fantasy tabletop RPG illustration, dramatic but readable lighting, rich material detail.",
      "Constraints: no text, no lettering, no watermark, no border, no UI, no collage.",
    ].join("\n"),
  };
}

async function walk(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(entries.map(async (entry) => entry.isDirectory() ? walk(join(directory, entry.name)) : [join(directory, entry.name)]));
  return files.flat();
}

function isEligible(source) {
  return /^type:\s*(creature|npc)\s*$/mi.test(source) && /```pf2e-stats/i.test(source);
}

async function inspect(notePath) {
  const source = await readFile(notePath, "utf8");
  if (!isEligible(source)) throw new Error(`${notePath}: not a PF2e creature or NPC source note.`);
  const fields = parseFrontmatter(source, notePath);
  const image = portraitPath(source, notePath);
  if (image) {
    return {
      status: "portrait-already-present",
      source: relative(repositoryDir, notePath).replaceAll("\\", "/"),
      portrait: relative(repositoryDir, image).replaceAll("\\", "/"),
    };
  }
  return promptRequest(fields, notePath);
}

const [argument] = process.argv.slice(2);
if (!argument) {
  throw new Error("Usage: node foundry-module/scripts/portrait-request.mjs <campaign-note.md> | --check");
}

if (argument === "--check") {
  const notes = (await walk(campaignDir)).filter((path) => path.endsWith(".md"));
  const results = [];
  for (const notePath of notes) {
    const source = await readFile(notePath, "utf8");
    if (isEligible(source)) results.push(await inspect(notePath));
  }
  const ready = results.filter((result) => result.status === "ready-for-image-generation");
  console.log(JSON.stringify({ results, ready: ready.length }, null, 2));
  if (ready.length > 0) process.exitCode = 2;
} else {
  const notePath = resolve(repositoryDir, argument);
  const campaignRelative = relative(campaignDir, notePath);
  if (campaignRelative.startsWith("..") || resolve(campaignDir, campaignRelative) !== notePath) {
    throw new Error("The source note must be beneath campaign/.");
  }
  console.log(JSON.stringify(await inspect(notePath), null, 2));
}
