const fs = require('node:fs/promises');
const path = require('node:path');
const {pathToFileURL} = require('node:url');
const {parseArgs} = require('node:util');

const usage = 'Usage: node tools/atlas-tests/render-expedition-map.cjs --output <map.webp>\nSet CHROME_PATH to use an installed Chrome instead of Playwright Chromium.';

async function main() {
  const {values} = parseArgs({options:{output:{type:'string'},help:{type:'boolean',short:'h'}},allowPositionals:false});
  if(values.help){console.log(usage);return;}
  if(!values.output)throw new Error('An explicit --output path is required.\n'+usage);
  const target = path.resolve(values.output);
  if(path.extname(target).toLowerCase()!=='.webp')throw new Error('--output must name a .webp file.');

  const repository = path.resolve(__dirname,'../..');
  const {recipe,buildExpeditionRecoveryScene} = await import(pathToFileURL(path.join(repository,'foundry-module/scripts/expedition-recovery-scene.mjs')).href);
  const {scene} = buildExpeditionRecoveryScene();
  const {chromium} = require('playwright');
  const browser = await chromium.launch({headless:true,...(process.env.CHROME_PATH?{executablePath:process.env.CHROME_PATH}:{})});
  try {
    const page = await browser.newPage();
    await page.setContent('<canvas id="map"></canvas>');
    await page.addScriptTag({path:path.join(repository,'site/atlas/battlemap-engine.js')});
    const result = await page.evaluate(({recipe,pixelsPerCell})=>{
      const canvas = document.getElementById('map');
      const model = SaerothBattlemapEngine.generate(recipe);
      SaerothBattlemapEngine.render(canvas,model,{pixelsPerCell,grid:false});
      return {width:canvas.width,height:canvas.height,image:canvas.toDataURL('image/webp',0.94)};
    },{recipe,pixelsPerCell:scene.grid.size});
    if(result.width!==scene.width||result.height!==scene.height)throw new Error('Rendered map dimensions do not match the maintained Foundry scene.');
    if(!result.image.startsWith('data:image/webp;base64,'))throw new Error('The browser did not produce a WebP image.');
    await fs.mkdir(path.dirname(target),{recursive:true});
    await fs.writeFile(target,Buffer.from(result.image.slice('data:image/webp;base64,'.length),'base64'));
    console.log(`Rendered ${recipe.name}: ${result.width}×${result.height} → ${target}`);
  } finally {
    await browser.close();
  }
}

main().catch(error=>{console.error(error.message);process.exitCode=1;});
