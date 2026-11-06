const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const base = process.env.ATLAS_TEST_URL || 'http://127.0.0.1:8899/';
const sourcePath = 'campaign/npcs/Karoline.md';
const prepPath = 'campaign/sessions/Session 4 - The Mountain Road.md';
const route = note => '#/' + note.split('/').map(encodeURIComponent).join('/');
async function downloaded(page, action) {
  const pending = page.waitForEvent('download'); await action();
  const file = await pending; const content = await fs.readFile(await file.path(), 'utf8'); return JSON.parse(content);
}

(async () => {
  const browser = await chromium.launch({ headless: true, ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}) });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce', serviceWorkers: 'block', acceptDownloads: true });
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.goto(base); await page.getByRole('heading', { name: 'Campaign desk', exact: true }).waitFor();
    await page.locator('#wsLatest a').first().waitFor();
    assert.match(await page.locator('#wsLatest').innerText(), /Session 4 - Waystation WLW/);
    assert.equal(await page.locator('.ws-party a').count(), 6);
    await page.screenshot({ path: path.join(__dirname, '../../_site/workspace-desktop.png'), fullPage: false });

    await page.goto(base + '#/library'); await page.locator('#wsLibrarySearch').fill('Karoline');
    assert(await page.locator('.ws-library-card').count() >= 1);
    const karoline = page.locator('.ws-library-card').filter({ has: page.getByRole('heading', { name: 'Karoline', exact: true }) });
    assert.equal(await karoline.count(), 1);
    await karoline.locator('[data-ws-action="pin"]').click();
    assert.equal(await karoline.locator('[data-ws-action="pin"]').getAttribute('aria-pressed'), 'true');
    await karoline.locator('[data-ws-action="board"]').click();
    assert.equal(await karoline.locator('[data-ws-action="board"]').isDisabled(), true);
    await page.locator('[data-ws-action="list"]').click(); assert(await page.locator('.ws-library-list').isVisible());
    await page.locator('#wsLibrarySearch').fill('impossible-nonexistent-character');
    assert(await page.getByRole('heading', { name: 'No entries found' }).isVisible());
    await page.locator('[data-ws-action="reset-search"]').click(); assert(await page.locator('.ws-library-card').count() > 1);

    await page.goto(base + route(prepPath)); await page.locator('.ws-note-actions [data-ws-action="board"]').click();
    await page.goto(base + '#/workspace'); await page.locator('#wsTitle').fill('Session 5 — At the expedition');
    await page.locator('#wsNotes').fill('Remember: no fixed outcome.\nThe party asks about supplies.\n<script>unsafe()</script>');
    await page.locator('#wsNotes').press('/'); assert.equal(await page.locator('#searchModal').isVisible(), false);
    await page.locator('#wsTaskInput').fill('Check the scene lighting'); await page.locator('#wsTaskForm button').click();
    await page.locator('#wsTasks input').check(); assert.match(await page.locator('#wsTaskCount').innerText(), /1 of 1 complete/);
    assert.equal(await page.locator('#wsBoardList li').count(), 2);
    await page.locator('#wsBoardList li').nth(1).locator('[data-ws-action="up"]').click();
    assert.match(await page.locator('#wsBoardList li').first().innerText(), /Session 4 - The Mountain Road/);

    const journal = await downloaded(page, () => page.locator('[data-ws-action="foundry"]').click());
    assert.equal(journal.name, 'Session 5 — At the expedition');
    assert.deepEqual(journal.ownership, { default: 0 }); assert.equal(journal.pages.length, 3);
    assert.equal(journal.pages[1].name, 'Session 4 - The Mountain Road'); assert.equal(journal.pages[2].name, 'Karoline');
    assert(journal.pages.every(p => p.type === 'text' && p.text.format === 1));
    assert(journal.pages[0].text.content.includes('&lt;script&gt;unsafe()&lt;/script&gt;'));
    assert(!journal.pages[0].text.content.includes('<script>'));
    assert(journal.pages[2].text.content.includes('http://127.0.0.1:'));
    assert(journal.pages[2].text.content.includes('ownership') === false);
    assert(journal.pages[1].text.content.length > 10000, 'Full source must be exported, not the truncated search summary.');
    assert(journal.pages[2].text.content.includes('img src="http'), 'Portrait source must be absolute inside Foundry.');
    await fs.writeFile(path.join(__dirname, '../../_site/workspace-journal-test.json'), JSON.stringify(journal, null, 2));
    const backup = await downloaded(page, () => page.locator('[data-ws-action="backup"]').click());
    assert.equal(backup.version, 1); assert.equal(backup.board.length, 2); assert.equal(backup.tasks[0].done, true);

    await page.reload(); await page.locator('#wsTitle').waitFor();
    assert.equal(await page.locator('#wsTitle').inputValue(), 'Session 5 — At the expedition');
    assert.equal(await page.locator('#wsTasks input').isChecked(), true); assert.equal(await page.locator('#wsPins .ws-note-row').count(), 1);
    assert((await page.locator('#wsNotes').inputValue()).includes('party asks'));
    await page.locator('[data-ws-action="remove-board"]').first().click(); assert.equal(await page.locator('#wsBoardList li').count(), 1);
    await page.locator('#wsToast').getByRole('button', { name: 'Undo', exact: true }).click(); assert.equal(await page.locator('#wsBoardList li').count(), 2);

    const merged = { ...backup, tasks: [...backup.tasks, { id: 'phone-task', text: 'Read the expedition briefing', done: false }], notes: 'A note written on the phone.' };
    await page.locator('#wsImportFile').setInputFiles({ name: 'desk.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(merged)) });
    await page.waitForFunction(() => document.getElementById('wsImportStatus').textContent.includes('Backup merged'));
    assert.equal(await page.locator('#wsTasks li').count(), 2); assert((await page.locator('#wsNotes').inputValue()).includes('Remember: no fixed outcome.'));
    assert((await page.locator('#wsNotes').inputValue()).includes('phone.'));
    await page.locator('#wsImportFile').setInputFiles({ name: 'bad.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify({ ...backup, board: ['campaign/../../secret.md'] })) });
    await page.waitForFunction(() => document.getElementById('wsImportStatus').textContent.includes('invalid board'));
    assert.equal(await page.locator('#wsTasks li').count(), 2);
    assert.deepEqual(errors, []);
    await page.close();

    for (const theme of ['light', 'dark']) {
      const mobile = await browser.newPage({ viewport: { width: 375, height: 812 }, colorScheme: theme, reducedMotion: 'reduce', serviceWorkers: 'block' });
      await mobile.goto(base); await mobile.getByRole('heading', { name: 'Campaign desk', exact: true }).waitFor();
      await mobile.locator('.ws-atlas-preview img').evaluate(img => img.decode());
      await mobile.screenshot({ path: path.join(__dirname, `../../_site/workspace-phone-${theme}.png`) });
      assert(await mobile.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      const targets = await mobile.locator('.ws-tabs a, .ws-hero-actions a, .ws-hero-actions button').evaluateAll(els => els.map(e => e.getBoundingClientRect().height));
      assert(targets.every(h => h >= 44), 'Primary actions need phone-sized hit areas.');
      await mobile.goto(base + '#/library'); await mobile.locator('#wsLibrarySearch').waitFor();
      assert(await mobile.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      await mobile.screenshot({ path: path.join(__dirname, `../../_site/workspace-library-phone-${theme}.png`) });
      await mobile.close();
    }

    const blocked = await browser.newPage({ serviceWorkers: 'block' });
    await blocked.addInitScript(() => { Storage.prototype.setItem = function () { throw new DOMException('Quota exceeded', 'QuotaExceededError'); }; });
    await blocked.goto(base); await blocked.locator('#wsNotes').fill('Keep this even if storage fails.');
    assert.match(await blocked.locator('#wsSaveStatus').innerText(), /could not save/);
    const fallback = await downloaded(blocked, () => blocked.locator('[data-ws-action="backup"]').click());
    assert.equal(fallback.notes, 'Keep this even if storage fails.'); await blocked.close();

    const corrupt = await browser.newPage({ serviceWorkers: 'block' });
    await corrupt.addInitScript(() => { const key = 'saeroth-workspace-v1:' + location.pathname.replace(/\/[^/]*$/, '/'); if (!localStorage.getItem(key + ':seeded')) { localStorage.setItem(key, '{broken original'); localStorage.setItem(key + ':seeded', 'yes'); } });
    await corrupt.goto(base); await corrupt.locator('[data-ws-action="recovery"]').waitFor();
    assert.equal(await corrupt.evaluate(() => Object.keys(localStorage).filter(k => k.endsWith(':recovery')).map(k => localStorage.getItem(k))[0]), '{broken original');
    await corrupt.locator('#wsNotes').fill('A fresh recoverable draft.');
    assert.equal(await corrupt.evaluate(() => Object.keys(localStorage).filter(k => k.endsWith(':recovery')).map(k => localStorage.getItem(k))[0]), '{broken original');
    await corrupt.close();

    const unicode = await browser.newPage({ serviceWorkers: 'block' }); await unicode.goto(base); await unicode.locator('#wsImportFile').waitFor({state: 'attached'});
    const largeBackup = { version: 1, pins: Array.from({ length: 100 }, (_, i) => `campaign/${'界'.repeat(150)}${i}.md`), recent: [], board: [], tasks: Array.from({ length: 100 }, (_, i) => ({ id: `task-${i}`, text: '界'.repeat(235) + String(i).padStart(5, '0'), done: false })), notes: '界'.repeat(40000), title: 'Unicode backup', libraryView: 'cards' };
    const bytes = Buffer.from(JSON.stringify(largeBackup)); assert(bytes.length > 200000);
    await unicode.locator('#wsImportFile').setInputFiles({name: 'unicode.json', mimeType: 'application/json', buffer: bytes});
    await unicode.waitForFunction(() => document.getElementById('wsImportStatus').textContent.includes('Backup merged'));
    assert.equal(await unicode.locator('#wsTasks li').count(), 100); assert.equal((await unicode.locator('#wsNotes').inputValue()).length, 40000); await unicode.close();
    console.log('Workspace: library, pins, packet ordering, persistence, backup merge/validation/recovery, Foundry journal export, storage failure, and phone themes passed.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
