import { readFile } from "node:fs/promises";
import { basename, dirname, resolve, relative } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const campaign = resolve(root, "campaign");
const note = resolve(root, process.argv[2] ?? "");
if (!relative(campaign, note) || relative(campaign, note).startsWith("..")) throw new Error("Provide a creature or NPC note beneath campaign/.");
const source = await readFile(note, "utf8");
if (!/^type:\s*(npc|creature)\s*$/m.test(source)) throw new Error("Requires an NPC or creature note.");
const image = source.match(/!\[[^\]]*\]\(([^)]+)\)/)?.[1];
if (!image) throw new Error("Create the portrait first.");
const portrait = resolve(dirname(note), decodeURIComponent(image));
if (relative(campaign, portrait).startsWith("..")) throw new Error("Portrait must be beneath campaign/.");
const token = `${basename(note, ".md")} token.png`;
console.log(JSON.stringify({
  input: portrait,
  output: resolve(dirname(note), token),
  frontmatter: `token-image: "${encodeURIComponent(token)}"`,
  prompt: "Edit the supplied portrait into a square virtual tabletop token. Preserve the creature identity, clothing, colors and hand-inked style. Frame a readable head-and-upper-torso crop within a centered circular dark iron ring with a narrow aged-brass edge. Keep identifying equipment visible where possible. Ring occupies 94% of the canvas width. Keep subdued charcoal inside the circle, and actual transparent alpha outside the rim. No painted checkerboard, lettering, watermark, or protruding ornament. Save separately; preserve the original portrait.",
  verification: "Verify square dimensions and actual transparent corner pixels before packaging; a checkerboard painted into RGB is not transparency."
}, null, 2));
