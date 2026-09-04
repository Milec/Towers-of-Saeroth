// Rank a batch of worlds instead of tuning one.
//
// Most of what is still wrong with a generated map is seed-dependent, not
// systematic — the same parameters that give one seed a clean continent give
// the next one a country sliced off the top edge. The README has said "sweep,
// don't tune" since the first build and there was no sweep, so every sweep was
// done by hand, by eye, on console output, which is how a map with a nation in
// the polar ice shipped twice.
//
//   node tools/mapgen/sweep.js --seeds 1-16
//   node tools/mapgen/sweep.js --seeds 3,7,11 --opts '{"knit":0.01}'
//   node tools/mapgen/sweep.js --seeds 1-8 --vary '{"knit":[0.006,0.018]}'
//   node tools/mapgen/sweep.js --seeds 1-24 --jobs 4 --timeout 240
//
// A scoring run is a couple of minutes, nearly all of it waiting on a headless
// browser, so runs go three at a time by default (`--jobs N`).
//
// Rows are ranked best-first on the things that cannot be fixed afterwards, in
// this order:
//
//   1. continent coherence  — a continent in pieces is not a continent, and
//                             every other metric is per-nation, so a country
//                             stranded on its own island scores perfectly
//   2. inspector problems   — a nation in the ice, in the wrong climate band,
//                             too small to settle, or four times its share
//   3. required borders     — the adjacencies the vault's own notes assert
//   4. trade legs           — a corridor the notes describe that the map has
//                             no road or sea lane for
//   5. terrain majorities   — each nation standing on the ground its note claims
//
// Nothing here writes a .map. Pick a seed off the table, then build it for
// real with `PFX=saeroth OUT=campaign/Saeroth.map OPTS='{"seed":N}'`.
const { execFile } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

function parseArgs(argv) {
  const out = { seeds: [1, 2, 3, 4, 5, 6, 7, 8], opts: {}, vary: null, jobs: 3, timeout: 360000 };
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    if (k === '--seeds') out.seeds = expandSeeds(argv[++i]);
    else if (k === '--opts') out.opts = JSON.parse(argv[++i]);
    else if (k === '--vary') out.vary = JSON.parse(argv[++i]);
    else if (k === '--jobs') out.jobs = Math.max(1, +argv[++i]);
    else if (k === '--timeout') out.timeout = Math.max(60, +argv[++i]) * 1000;
    else throw new Error(`unknown argument ${k}`);
  }
  return out;
}

// "1-8", "3,7,11" or a mix of both
function expandSeeds(spec) {
  const out = [];
  for (const part of String(spec).split(',')) {
    const m = part.match(/^(\d+)\s*-\s*(\d+)$/);
    if (m) for (let n = +m[1]; n <= +m[2]; n++) out.push(n);
    else out.push(+part);
  }
  return out;
}

// {a:[1,2], b:[3]} -> [{a:1,b:3}, {a:2,b:3}]
function combos(vary) {
  if (!vary) return [{}];
  let rows = [{}];
  for (const [k, vs] of Object.entries(vary)) {
    const next = [];
    for (const row of rows) for (const v of vs) next.push(Object.assign({}, row, { [k]: v }));
    rows = next;
  }
  return rows;
}

const A = parseArgs(process.argv.slice(2));
const HERE = __dirname;
const REPO = path.dirname(path.dirname(HERE));
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'saeroth-sweep-'));

const runs = [];
for (const extra of combos(A.vary)) {
  for (const seed of A.seeds) runs.push(Object.assign({ seed }, A.opts, extra));
}
console.log(`${runs.length} run(s), ${Math.min(A.jobs, runs.length)} at a time\n`);

// A run that will not finish must not hold up the sweep. Some seeds build a
// world the generator grinds on for twenty minutes; one of them stalled a
// 24-seed sweep behind a single row.
function run(cmd, args, env, timeout) {
  return new Promise(resolve => {
    execFile(cmd, args, { cwd: REPO, encoding: 'utf8', maxBuffer: 1 << 26, env, timeout,
                          killSignal: 'SIGKILL' },
      (err, stdout, stderr) => resolve({ err, stdout, stderr }));
  });
}

async function score(opts, index) {
  const profile = path.join(tmp, `p-${index}.json`);
  const label = Object.entries(opts).map(([k, v]) => `${k}=${v}`).join(' ');
  const built = await run('node', [path.join(HERE, 'build.js')],
    Object.assign({}, process.env, {
      SKIP_SAVE: '1', NO_SHOT: '1', PROFILE: profile, OPTS: JSON.stringify(opts),
    }), A.timeout);
  if (built.err && !fs.existsSync(profile)) {
    console.log(`${label.padEnd(30)} BUILD FAILED — ${String(built.err.message).split('\n')[0]}`);
    return null;
  }
  // inspect.py exits non-zero when it finds problems: the JSON is still on stdout
  const scored = await run('python3',
    [path.join(HERE, 'inspect.py'), '--profile', profile, '--json'], process.env, 60000);
  let s2 = null;
  try { s2 = JSON.parse(scored.stdout); } catch (e) { s2 = null; }
  if (!s2) { console.log(`${label.padEnd(28)} no score`); return null; }

  // continent coherence is not one of the profile's summary numbers — it is a
  // line the forge logs, and it is the first thing to rank on
  const P = JSON.parse(fs.readFileSync(profile, 'utf8'));
  // Continent coherence. Count only landmasses holding a real share of the
  // group — a continent of 7,862 cells plus six on two skerries is one
  // continent, and counting the skerries made the whole ranking read backwards.
  let split = 0;
  for (const line of (P.log || [])) {
    const m = line.match(/^group (\d+): (\d+) cells across \d+ landmass\(es\) \(([\d, ]+)\)/);
    if (!m || m[1] === '2') continue;           // group 2 IS an archipelago
    const total = +m[2], sizes = m[3].split(',').map(Number);
    split += sizes.filter(n => n >= total * 0.05).length - 1;
  }
  s2.split = split;                             // 0 when every continent is whole
  s2.label = label;
  s2.legsWanted = (built.stdout.match(/(\d+)\/(\d+) legs pathfound/) || [])[2];
  // how much of the political geography the vault did NOT ask for: a world
  // where every frontier is one the notes have an opinion about reads as a
  // diagram of the diplomacy rather than as a place
  s2.quiet = P.quietFrontiers; s2.frontiers = P.frontiers;
  console.log(`${label.padEnd(30)} split ${s2.split}  problems ${s2.problems}  ` +
              `borders ${s2.borders}  terrain ${s2.majority}  ` +
              `legs ${s2.legs}/${s2.legsWanted}  drift ${s2.drift}  ` +
              `quiet ${s2.quiet}/${s2.frontiers}`);
  return s2;
}

const rows = [];
let next = 0;
async function worker() {
  for (;;) {
    const i = next++;
    if (i >= runs.length) return;
    const r = await score(runs[i], i);
    if (r) rows.push(r);
  }
}

(async () => {
await Promise.all(Array.from({ length: Math.min(A.jobs, runs.length) }, worker));

rows.sort((a, b) =>
  a.split - b.split ||
  a.problems - b.problems ||
  b.borders - a.borders ||
  (b.legs || 0) - (a.legs || 0) ||
  b.majority - a.majority ||
  a.drift - b.drift);

console.log('\nbest first:');
for (const r of rows.slice(0, 10)) {
  console.log(`  ${r.label.padEnd(30)} split ${r.split}  problems ${r.problems}  ` +
              `borders ${r.borders}  terrain ${r.majority}  legs ${r.legs}/${r.legsWanted}  ` +
              `quiet ${r.quiet}/${r.frontiers}`);
  for (const f of r.fails.slice(0, 4)) console.log(`      ${f}`);
}
console.log(`\nprofiles kept in ${tmp}`);
})();
