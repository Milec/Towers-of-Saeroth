const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const base = process.env.ATLAS_TEST_URL || 'http://127.0.0.1:8899/';
const npcPath = 'campaign/npcs/Karoline.md';
const pathRoute = p => '#/edit/' + p.split('/').map(encodeURIComponent).join('/');
async function downloadText(page, action) { const pending = page.waitForEvent('download'); await action(); const download = await pending; return fs.readFile(await download.path(), 'utf8'); }

(async () => {
  const browser = await chromium.launch({ headless: true, ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}) });
  try {
    const page = await browser.newPage({ viewport: { width: 1540, height: 1000 }, serviceWorkers: 'block', reducedMotion: 'reduce' });
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.goto(base + '#/new'); await page.locator('#edName').waitFor();
    assert.match(page.url(), /#\/new#new-/);
    await page.locator('#edName').fill('Editor Test Scout'); await page.locator('#edNation').selectOption('Vaelic Principality');
    assert.match(await page.locator('#edPath').innerText(), /nations\/Vaelic Principality\/npcs\/Editor Test Scout\.md/);
    let source = await page.locator('#edSource').inputValue(); assert(source.includes('region: "[[Vaelic Principality]]"'));
    source += '\nA scout who knows the mountain paths.\n'; await page.locator('#edSource').fill(source);
    await page.waitForFunction(() => document.getElementById('edPreview').textContent.includes('A scout who knows'));
    await page.locator('#edSource').evaluate(el => { const start = el.value.indexOf('mountain paths'); el.focus(); el.setSelectionRange(start, start + 14); el.dispatchEvent(new Event('select')); });
    await page.locator('[data-ed="bold"]').click(); assert((await page.locator('#edSource').inputValue()).includes('**mountain paths**'));
    await page.locator('#edSource').press('Control+s'); assert.equal(await page.locator('#edDraftTray .ed-draft-row').count(), 1);
    const firstDraftURL = page.url(); const firstDraft = await page.locator('#edSource').inputValue();
    await page.reload(); await page.locator('#edSource').waitFor(); assert.equal(await page.locator('#edSource').inputValue(), firstDraft);

    // Multiple new drafts have separate durable identities and correct filing.
    await page.locator('.ed-card-head a').click(); await page.waitForFunction(previous => location.href !== previous && location.hash.startsWith('#/new#new-'), firstDraftURL); await page.locator('#edName').fill('Editor Test Beast'); await page.locator('#edType').selectOption('creature');
    assert.match(await page.locator('#edPath').innerText(), /world\/bestiary\/Editor Test Beast\.md/);
    assert.equal(await page.locator('#edNationField').isVisible(), false);
    assert.equal(await page.locator('#edDraftTray .ed-draft-row').count(), 2);
    await page.locator('#edDraftTray a').filter({hasText: 'Editor Test Scout'}).click();
    await page.waitForFunction(() => document.getElementById('edName').value === 'Editor Test Scout');
    assert.equal(page.url(), firstDraftURL); assert.equal(await page.locator('#edSource').inputValue(), firstDraft);
    const markdown = await downloadText(page, () => page.locator('[data-ed="download"]').click()); assert.equal(markdown, firstDraft);

    // Unknown links and a title mismatch are caught before any credential prompt.
    await page.locator('#edSource').fill(firstDraft + '\n[[Not an existing campaign entry]]\n'); await page.locator('#edPublish').click();
    assert.match(await page.locator('#edValidation').innerText(), /do not match a campaign entry/);
    await page.locator('#edSource').fill(firstDraft);
    await page.locator('#edSource').evaluate(el => { el.focus(); el.setSelectionRange(el.value.length, el.value.length); el.dispatchEvent(new Event('select')); });
    await page.locator('[data-ed="link"]').click(); await page.locator('#edLinkName').fill('Karoline'); await page.locator('[data-ed="insert-link"]').click();
    assert((await page.locator('#edSource').inputValue()).includes('[[Karoline]]'));

    // Untrusted pasted HTML cannot run in the preview.
    const safeDraft = await page.locator('#edSource').inputValue();
    await page.locator('#edSource').fill(safeDraft + '\n<img src="missing-preview.png" onerror="window.__editorAttack=1"><script>window.__editorAttack=2</script><span data-ed="publish" id="edToken">Authored control attempt</span><span data-ed="disconnect" id="edPublish">Disconnect attempt</span>\n');
    await page.waitForTimeout(250); assert.equal(await page.evaluate(() => window.__editorAttack), undefined);
    assert.equal(await page.locator('#edPreview script, #edPreview [onerror]').count(), 0);
    assert.equal(await page.locator('#edPreview [id], #edPreview [data-ed]').count(), 0);
    await page.locator('#edPreview').getByText('Authored control attempt').click();
    assert.equal(await page.locator('#edPublishStatus').innerText(), '');
    await page.locator('#edSource').fill(safeDraft);

    // Stub only the publishing service to exercise conflict UX; the real client
    // receives a separate mocked-GitHub end-to-end suite.
    await page.evaluate(() => {
      window.__editorCalls = []; window.__editorRemote = {text: null, sha: null};
      const real = window.SaerothPublisher;
      window.SaerothPublisher = { ...real, createClient: token => ({
        connect: async () => { window.__editorToken = token; },
        load: async () => ({...window.__editorRemote, head:'a'.repeat(40), pending:null}),
        publish: async input => { window.__editorCalls.push(input); window.__editorRemote = {text:input.content,sha:'b'.repeat(40)}; return {url:'https://github.com/Milec/Towers-of-Saeroth/pull/999',number:999,branch:'test',head:'a'.repeat(40),noteSHA:'b'.repeat(40),status:'pending'}; },
        status: async () => ({status:'merged',url:'https://github.com/Milec/Towers-of-Saeroth/pull/999'})
      })};
    });
    await page.locator('#edPublish').click(); await page.locator('#edToken').fill('fake-editor-token-never-persist'); await page.locator('#edConnectForm button').click();
    await page.waitForFunction(() => document.getElementById('edConnectionStatus').textContent.includes('Connected'));
    assert.equal(await page.locator('#edToken').inputValue(), '');
    await page.locator('#edPublish').click(); await page.waitForFunction(() => window.__editorCalls.length === 1);
    assert.equal(await page.evaluate(() => window.__editorCalls[0].expectedBlobSha), null);
    assert.equal(await page.evaluate(() => window.__editorCalls[0].baseText), null);
    assert.match(await page.locator('#edPublishStatus').innerText(), /not published yet/);
    assert.equal(await page.evaluate(() => Object.keys(localStorage).some(k => (localStorage.getItem(k) || '').includes('fake-editor-token-never-persist'))), false);
    await page.locator('#edCheckStatus').click(); await page.waitForFunction(() => document.getElementById('edPublishStatus').textContent.includes('Merged.'));

    // Existing entry edits preserve the entire frontmatter and never rename.
    const response = await page.request.get(base + 'content/' + npcPath.split('/').map(encodeURIComponent).join('/')); const original = await response.text();
    await page.evaluate(text => { window.__editorRemote = {text,sha:'c'.repeat(40)}; }, original);
    await page.goto(base + pathRoute(npcPath)); await page.locator('#edSource').waitFor();
    // The connection survives same-tab hash navigation; disconnect explicitly
    // before testing a second authoritatively loaded source.
    await page.locator('#edConnect > summary').click(); await page.locator('#edDisconnect').click();
    await page.evaluate(text => {
      window.__editorCalls = []; window.__editorRemote = {text,sha:'c'.repeat(40)};
      const real = window.SaerothPublisher;
      window.SaerothPublisher = {...real,createClient: () => ({connect:async()=>{},load:async()=>({...window.__editorRemote,pending:null}),publish:async input=>{window.__editorCalls.push(input);return {status:'pending',number:998,url:'https://github.com/Milec/Towers-of-Saeroth/pull/998',noteSHA:'d'.repeat(40)};},status:async()=>({status:'pending'})})};
    }, original);
    const loaded = await page.locator('#edSource').inputValue(); assert.equal(loaded, original.replace(/\r\n/g, '\n'));
    await page.locator('#edSource').fill(loaded + '\nA local draft addition.\n');
    await page.evaluate(text => { window.__editorRemote = {text:text + '\nA newer repository addition.\n',sha:'e'.repeat(40)}; }, original);
    await page.locator('#edToken').fill('fake-conflict-token'); await page.locator('#edConnectForm button').click();
    await page.locator('#edConflict').waitFor();
    assert.match(await page.locator('#edConflict').innerText(), /changed after your draft started/);
    assert((await page.locator('#edSource').inputValue()).includes('A local draft addition.'));
    assert.equal(await page.evaluate(() => window.__editorCalls.length), 0);
    await page.locator('[data-ed="use-latest"]').click();
    assert((await page.locator('#edSource').inputValue()).includes('A newer repository addition.'));
    assert(await page.locator('.ed-recovery-link').count() >= 1);
    const recovered = await downloadText(page, () => page.locator('.ed-recovery-link').first().click()); assert(recovered.includes('A local draft addition.'));
    await page.locator('#edSource').fill((await page.locator('#edSource').inputValue()) + '\nA combined edit.\n');
    await page.locator('#edPublish').click(); await page.waitForFunction(() => window.__editorCalls.length === 1);
    assert.equal(await page.evaluate(() => window.__editorCalls[0].path), npcPath);
    assert.equal(await page.evaluate(() => window.__editorCalls[0].expectedBlobSha), 'e'.repeat(40));
    const fm = original.match(/^---\r?\n[\s\S]*?\r?\n---/)[0].replace(/\r\n/g, '\n');
    assert((await page.locator('#edSource').inputValue()).startsWith(fm));
    await page.screenshot({path:path.join(__dirname, '../../_site/editor-desktop.png')});
    assert.deepEqual(errors, []); await page.close();

    for (const theme of ['light', 'dark']) {
      const mobile = await browser.newPage({viewport:{width:375,height:812},colorScheme:theme,reducedMotion:'reduce',serviceWorkers:'block'});
      await mobile.goto(base + '#/new'); await mobile.locator('#edName').fill('Mountain Watch'); await mobile.locator('#edType').selectOption('location');
      await mobile.locator('#edSource').fill('---\ntitle: "Mountain Watch"\ntype: location\n---\n\n## Overview\n\nA lookout on the old road.\n');
      await mobile.locator('[data-ed="preview"]').click(); await mobile.waitForFunction(() => document.getElementById('edPreview').textContent.includes('A lookout'));
      assert.equal(await mobile.locator('#edSource').isVisible(), false);
      assert(await mobile.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      await mobile.screenshot({path:path.join(__dirname, `../../_site/editor-phone-${theme}.png`)});
      await mobile.close();
    }
    const storage = await browser.newPage({serviceWorkers:'block'});
    await storage.addInitScript(() => { Storage.prototype.setItem = function(){throw new DOMException('Quota exceeded','QuotaExceededError');}; });
    await storage.goto(base + '#/new'); await storage.locator('#edName').fill('Unsaved scout');
    assert.match(await storage.locator('#edDraftStatus').innerText(), /could not be saved/);
    assert.equal(await storage.evaluate(() => window.SaerothEditor.hasUnsavedChanges()), true);
    const preserved = await downloadText(storage, () => storage.locator('[data-ed="download"]').click()); assert(preserved.includes('Unsaved scout'));
    await storage.close();
    console.log('Editor: templates/filing, multiple draft recovery, Markdown toolbar, safe preview, validation, token secrecy, publishing states/conflicts, preserved properties, download and phone themes passed.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
