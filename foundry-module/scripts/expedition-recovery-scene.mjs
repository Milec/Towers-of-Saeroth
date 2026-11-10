import {readFileSync} from 'node:fs';
// The committed scene and its artwork were produced by the retired procedural
// battle map generator. They are kept as fixed artifacts: new maps come from the
// ImageGen pipeline described in foundry-module/README.md ("Battle maps").
export function buildExpeditionRecoveryScene() {
  const scene = JSON.parse(readFileSync(new URL('../content/scenes/expedition-supply-recovery.json', import.meta.url), 'utf8'));
  return {slug:'expedition-supply-recovery',asset:'assets/maps/expedition-supply-recovery.webp',scene};
}
