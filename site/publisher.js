/* A repository-scoped publishing client. Credentials live only in this closure. */
(() => {
  'use strict';
  const REPO = 'Milec/Towers-of-Saeroth', ROOT = 'https://api.github.com/repos/' + REPO;
  const MARKER = '<!-- saeroth-entry-editor -->', LIMIT = 128 * 1024, REGISTRY = 'campaign/world/Campaign Library.md';
  const ART = globalThis.SaerothEditorAsset;
  const sha = value => typeof value === 'string' && /^[a-f0-9]{40}$/.test(value);
  const sameName = value => value.normalize('NFKC').toLocaleLowerCase('en-US');
  const enc = value => value.split('/').map(encodeURIComponent).join('/');
  const fail = (message, code = 'invalid') => Object.assign(new Error(message), {code});
  function validPath(path) {
    if (typeof path !== 'string' || path.length > 450 || sameName(path) === sameName(REGISTRY) || !/^campaign\/.+\.md$/.test(path) || /[\\%#\[\]\x00-\x1f\x7f<>:"|?*]/.test(path)) return false;
    const parts = path.split('/');
    return parts.every(part => part && !part.startsWith('.') && !/[. ]$/.test(part) && !/^(?:con|prn|aux|nul|com[0-9]|lpt[0-9])(?:\.|$)/i.test(part)) &&
      !/^(?:AGENTS|CLAUDE|SKILL)\.md$/i.test(parts.at(-1));
  }
  function fields(content) {
    if (typeof content !== 'string' || new TextEncoder().encode(content).length > LIMIT || /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(content)) throw fail('Entries must be plain text under 128 KiB, without control characters.');
    const fm = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(content);
    if (!fm) throw fail('The entry needs title and type properties at the top.');
    const read = key => {
      const found = [...fm[1].matchAll(new RegExp('^' + key + ':[\\t ]*([^\\r\\n]*)$', 'gm'))];
      if (found.length !== 1) throw fail('The entry needs exactly one ' + key + ' property.');
      let value = found[0][1].trim();
      if (value.startsWith('"')) { try { value = JSON.parse(value); } catch (_) { throw fail('The ' + key + ' property has invalid quotes.'); } }
      else if (value.startsWith("'")) { if (!value.endsWith("'")) throw fail('The ' + key + ' property has invalid quotes.'); value = value.slice(1, -1).replace(/''/g, "'"); }
      if (typeof value !== 'string' || !value.trim() || /[\x00-\x1f\x7f]/.test(value)) throw fail('The ' + key + ' property is empty or invalid.');
      return value.trim();
    };
    const title = read('title'), type = read('type');
    if (title.length > 160 || !/^[a-z][a-z0-9 -]{0,39}$/i.test(type)) throw fail('Use a title under 160 characters and a simple entry type.');
    return {title, type};
  }
  function metadata(body) {
    if (typeof body !== 'string' || body.length > 20000 || body.split(/\r?\n/).filter(line => line === MARKER).length !== 1) return null;
    const lines = body.split(/\r?\n/).filter(line => line.startsWith('saeroth_entry: '));
    if (lines.length !== 1) return null;
    try {
      const value = JSON.parse(lines[0].slice(15));
      const expected = value.version === 2 ? 'asset,baseBlob,baseHead,operation,path,version' : 'baseBlob,baseHead,operation,path,version';
      if (Object.keys(value).sort().join(',') !== expected || ![1,2].includes(value.version) || !validPath(value.path) ||
        (value.version === 2 && !ART.validDescriptor(value.path,value.asset)) ||
        !(value.baseBlob === null || sha(value.baseBlob)) || !sha(value.baseHead) || !/^[a-f0-9]{64}$/.test(value.operation)) return null;
      return value;
    } catch (_) { return null; }
  }
  const reviewBody = meta => MARKER + '\nsaeroth_entry: ' + JSON.stringify(meta) +
    '\n\nCreated from the Saeroth entry editor. Publish this campaign entry and its declared artwork automatically after repository verification passes.\n';
  const existingTitle = text => { try { return fields(text).title; } catch (_) { return null; } };

  function createClient(token, request = fetch) {
    if (typeof token !== 'string' || !token.trim() || /\s/.test(token.trim())) throw fail('Enter a valid repository connection token.', 'auth');
    token = token.trim();
    let connected = false, busy = false;
    const textCache = new Map();
    async function api(path, method = 'GET', body) {
      let response;
      try { response = await request(ROOT + path, {method, headers:{Accept:'application/vnd.github+json', Authorization:'Bearer ' + token,
        'X-GitHub-Api-Version':'2022-11-28', ...(body ? {'Content-Type':'application/json'} : {})}, ...(body ? {body:JSON.stringify(body)} : {})}); }
      catch (_) { throw fail('The connection was interrupted. Your draft is safe. Retry to recover any pending publication.', 'network'); }
      if (!response.ok) {
        const message = response.status === 401 ? 'Your publishing connection expired. Reconnect; your draft is safe.' :
          response.status === 403 ? 'Publishing was denied. This connection needs repository Contents and Pull requests write access; rate limits can also block requests.' :
          response.status === 409 || response.status === 422 ? 'The remote entry or review branch changed. Reload its latest version before publishing again.' :
          'The publishing service returned ' + response.status + '. Your draft is safe; retry when it is available.';
        throw Object.assign(fail(message, response.status === 401 || response.status === 403 ? 'auth' : 'remote'), {status:response.status});
      }
      if (response.status === 204) return null;
      try { return await response.json(); } catch (_) { throw fail('The publication response was incomplete. Retry to recover it safely.', 'network'); }
    }
    async function maybe(path) { try { return await api(path); } catch (error) { if (error.status === 404) return null; throw error; } }
    const ref = branch => maybe('/git/ref/heads/' + encodeURIComponent(branch));
    async function blob(id) {
      if (!sha(id)) throw fail('The repository returned an invalid content identifier.', 'remote');
      if (!textCache.has(id)) {
        const value = await api('/git/blobs/' + id);
        if (value.encoding !== 'base64' || typeof value.content !== 'string') throw fail('The repository returned unsupported content.', 'remote');
        try { textCache.set(id, new TextDecoder('utf-8', {fatal:true}).decode(Uint8Array.from(atob(value.content.replace(/\s/g,'')), c => c.charCodeAt(0)))); }
        catch (_) { throw fail('The entry is not valid UTF-8 text.', 'remote'); }
      }
      return textCache.get(id);
    }
    async function file(path, head) {
      const value = await maybe('/contents/' + enc(path) + '?ref=' + encodeURIComponent(head));
      if (!value) return null;
      if (!sha(value.sha) || value.type !== 'file') throw fail('This path is not a Markdown file.', 'conflict');
      let text;
      if (value.encoding === 'base64' && typeof value.content === 'string') {
        try { text = new TextDecoder('utf-8', {fatal:true}).decode(Uint8Array.from(atob(value.content.replace(/\s/g,'')), c => c.charCodeAt(0))); }
        catch (_) { throw fail('The entry is not valid UTF-8 text.', 'remote'); }
        textCache.set(value.sha, text);
      } else text = await blob(value.sha);
      return {text, sha:value.sha};
    }
    async function assetFile(meta, head) {
      if (!meta?.asset) return null;
      const value = await maybe('/contents/' + enc(meta.asset.path) + '?ref=' + encodeURIComponent(head));
      if (!value || value.type !== 'file' || !sha(value.sha)) throw fail('The declared artwork is missing or is not a file.', 'conflict');
      const blob = await api('/git/blobs/' + value.sha);
      if (blob.encoding !== 'base64' || typeof blob.content !== 'string' || blob.size !== meta.asset.bytes ||
          (blob.sha && blob.sha !== value.sha)) throw fail('The declared artwork could not be verified.', 'conflict');
      try { return await ART.validate({mime:meta.asset.mime,sha256:meta.asset.sha256,bytes:meta.asset.bytes,data:blob.content.replace(/\s/g,'')}); }
      catch (_) { throw fail('The declared artwork no longer matches its content fingerprint.', 'conflict'); }
    }
    const withAsset = (meta, asset) => {
      const {path,baseBlob,baseHead,operation} = meta;
      return asset ? {version:2,path,baseBlob,baseHead,operation,asset:ART.descriptor(path,asset)} : {version:1,path,baseBlob,baseHead,operation};
    };
    async function chosenAsset(input, meta, head, content) {
      if (input === undefined) return meta?.asset && ART.reference(content,ART.filename(meta.asset.sha256)) ? assetFile(meta,head) : null;
      if (input === null) {
        if (meta?.asset && ART.reference(content,ART.filename(meta.asset.sha256))) throw fail('Remove the staged artwork link before removing its upload.');
        return null;
      }
      const asset = await ART.validate(input);
      if (!ART.reference(content,ART.filename(asset.sha256))) throw fail('The entry must include its uploaded artwork on a Markdown image line.');
      return asset;
    }
    async function artworkChanges(path, asset, previous, head, mainHead, content) {
      const extra = [], destination = asset ? ART.assetPath(path,asset.sha256) : null;
      if (previous?.asset && previous.asset.path !== destination) {
        const onMain = await maybe('/contents/' + enc(previous.asset.path) + '?ref=' + encodeURIComponent(mainHead));
        if (!onMain) {
          if (ART.reference(content,ART.filename(previous.asset.sha256))) throw fail('Remove the previous staged artwork link before replacing its upload.');
          const prior = await maybe('/contents/' + enc(previous.asset.path) + '?ref=' + encodeURIComponent(head));
          if (prior) extra.push({path:previous.asset.path,mode:'100644',type:'blob',sha:null});
        }
      }
      if (asset) {
        const descriptor = {asset:ART.descriptor(path,asset)};
        const onMain = await maybe('/contents/' + enc(destination) + '?ref=' + encodeURIComponent(mainHead));
        if (onMain) await assetFile(descriptor,mainHead);
        const existing = await maybe('/contents/' + enc(destination) + '?ref=' + encodeURIComponent(head));
        if (existing) await assetFile(descriptor,head);
        else {
          const blob = onMain || await api('/git/blobs','POST',{encoding:'base64',content:asset.data});
          if (!sha(blob.sha)) throw fail('Artwork upload returned an invalid content identifier.', 'remote');
          extra.push({path:destination,mode:'100644',type:'blob',sha:blob.sha});
        }
      }
      return extra;
    }
    function reviewIdentity(pr) {
      const meta = metadata(pr?.body);
      if (!meta || pr.head?.repo?.full_name !== REPO || pr.base?.repo?.full_name !== REPO || pr.base?.ref !== 'main' ||
        !/^entry-editor-[a-z0-9][a-z0-9-]{0,95}$/.test(pr.head?.ref || '') || !Number.isInteger(pr.number) || !sha(pr.head?.sha)) {
        throw fail('The pending publication could not be verified. No remote content was changed.', 'conflict');
      }
      return meta;
    }
    const registryLine = path => '\n- [[' + path.split('/').at(-1).slice(0,-3) + ']]\n';
    async function verifyChanges(meta, head) {
      const comparison = await api('/compare/' + meta.baseHead + '...' + head), changed = comparison.files;
      const target = changed?.find(row => row.filename === meta.path), artwork = changed?.find(row => row.filename === meta.asset?.path);
      if (!Array.isArray(changed) || !target || target.status !== (meta.baseBlob === null ? 'added' : 'modified') ||
        changed.some(row => row.filename !== meta.path && row.filename !== REGISTRY && row.filename !== meta.asset?.path) ||
        (meta.baseBlob !== null && changed.some(row => row.filename === REGISTRY)) ||
        changed.length > (meta.baseBlob === null ? 2 : 1) + (meta.asset ? 1 : 0) ||
        (artwork && (artwork.status !== 'added' || artwork.previous_filename))) {
        throw fail('This review contains other changes. Resolve it before publishing from the editor.', 'conflict');
      }
      if (meta.asset) {
        const note = await file(meta.path,head);
        if (!note || !ART.reference(note.text,ART.filename(meta.asset.sha256))) throw fail('The pending entry does not reference its declared artwork.', 'conflict');
        await assetFile(meta,head);
        if (!artwork) await assetFile(meta,meta.baseHead);
      }
      if (meta.baseBlob === null) {
        const original = await file(REGISTRY,meta.baseHead), current = await file(REGISTRY,head), line = registryLine(meta.path);
        if (!original || !current || current.text !== original.text + line || changed.find(row=>row.filename===REGISTRY)?.status !== 'modified') {
          throw fail('The pending campaign index update could not be verified.', 'conflict');
        }
      }
    }
    async function verifyReview(pr, head = pr.head?.sha) {
      const meta = reviewIdentity(pr);
      try { await verifyChanges(meta,head); return meta; }
      catch (error) {
        if (error.code !== 'conflict') throw error;
        // A dropped response can leave a refreshed branch and its PR metadata
        // out of step. The immutable commit carries the same operation record.
        const commit = await api('/git/commits/' + head), candidate = metadata(commit.message);
        if (!candidate || candidate.path !== meta.path || candidate.operation !== meta.operation || candidate.baseBlob !== meta.baseBlob) throw error;
        await verifyChanges(candidate,head);
        return candidate;
      }
    }
    async function reviews() {
      const found = [];
      for (let page = 1; page <= 10; page++) {
        const batch = await api('/pulls?state=open&per_page=100&page=' + page);
        if (!Array.isArray(batch)) throw fail('The publication list is invalid.', 'remote');
        found.push(...batch.filter(pr => metadata(pr.body)));
        if (batch.length < 100) return found;
      }
      throw fail('There are too many pending publications to check safely.', 'remote');
    }
    function onlyReview(list, path) {
      const same = list.filter(pr => metadata(pr.body)?.path === path);
      if (same.length > 1) throw fail('This entry has more than one pending publication. Resolve those reviews before editing.', 'conflict');
      return same[0];
    }
    async function mainFile(path) {
      const main = await ref('main');
      if (!sha(main?.object?.sha)) throw fail('The campaign main branch is unavailable.', 'remote');
      return {head:main.object.sha, current:await file(path, main.object.sha)};
    }
    const result = (pr, head, noteSHA, asset = null) => ({url:pr.html_url, number:pr.number, branch:pr.head.ref, head, noteSHA, asset,
      status:pr.merged || pr.merged_at ? 'merged' : pr.state === 'closed' ? 'closed' : 'pending'});
    async function ensureConnected() { if (!connected) await connect(); }
    async function connect() {
      const repository = await api('');
      if (repository.full_name !== REPO || !repository.permissions?.push) throw fail('This connection needs write access to Towers-of-Saeroth.', 'auth');
      connected = true;
      return {repository:REPO, connected:true};
    }
    async function load(path) {
      if (!validPath(path)) throw fail('Choose a Markdown entry inside the campaign.');
      await ensureConnected();
      const {head, current} = await mainFile(path), review = onlyReview(await reviews(), path);
      if (!review) return {text:current?.text ?? null, sha:current?.sha ?? null, head, pending:null};
      let meta = await verifyReview(review);
      if ((current?.sha ?? null) !== meta.baseBlob) throw fail('The published entry changed while a revision is pending. Resolve that review before editing.', 'conflict');
      const branch = await ref(review.head.ref);
      if (branch && branch.object.sha !== review.head.sha) meta = await verifyReview(review,branch.object.sha);
      const draft = branch && await file(path, branch.object.sha);
      if (!draft) throw fail('The pending entry is unavailable. Your local draft is safe.', 'conflict');
      const asset = await assetFile(meta,branch.object.sha);
      return {...draft, head:branch.object.sha, publishedSha:current?.sha ?? null, asset, pending:result(review, branch.object.sha, draft.sha, asset)};
    }
    async function campaignFiles(head) {
      const commit = await api('/git/commits/' + head);
      const root = await api('/git/trees/' + commit.tree.sha);
      if (root.truncated) throw fail('The repository listing was incomplete.', 'remote');
      const campaign = root.tree.find(item => item.path === 'campaign' && item.type === 'tree');
      if (!campaign) throw fail('The campaign directory is missing.', 'remote');
      const tree = await api('/git/trees/' + campaign.sha + '?recursive=1');
      if (tree.truncated) throw fail('The campaign listing was incomplete. No changes were published.', 'remote');
      return {commit, rows:tree.tree.filter(item => item.type === 'blob' && /\.md$/i.test(item.path)).map(item => ({...item,path:'campaign/' + item.path}))};
    }
    async function checkNames(path, title, head, pending) {
      const {rows} = await campaignFiles(head), wanted = new Set([sameName(title), sameName(path.split('/').at(-1).slice(0,-3))]);
      const others = rows.filter(row => row.path !== path);
      for (const row of others) if (wanted.has(sameName(row.path.split('/').at(-1).slice(0,-3)))) throw fail('Another campaign entry already uses this name. Choose a distinct title.', 'collision');
      // Frontmatter titles may differ from filenames. Cache immutable blobs and
      // bound parallel reads instead of trusting a potentially stale site index.
      for (let i = 0; i < others.length; i += 8) {
        await Promise.all(others.slice(i,i+8).map(async row => {
          const text = await blob(row.sha), fm = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text);
          const match = fm && /^title:\s*([^\r\n]+)$/mi.exec(fm[1]);
          if (!match) return;
          let existing = match[1].trim();
          try { if (existing.startsWith('"')) existing = JSON.parse(existing); else existing = existing.replace(/^'|'$/g,'').replace(/''/g,"'"); } catch (_) { return; }
          if (typeof existing === 'string' && wanted.has(sameName(existing))) throw fail('Another campaign entry already uses this title. Choose a distinct title.', 'collision');
        }));
      }
      for (const review of pending) {
        const meta = metadata(review.body); if (meta.path === path) continue;
        await verifyReview(review);
        if (wanted.has(sameName(meta.path.split('/').at(-1).slice(0,-3)))) throw fail('A pending entry already uses this name.', 'collision');
        const draft = await file(meta.path, review.head.sha);
        if (draft && wanted.has(sameName(fields(draft.text).title))) throw fail('A pending entry already uses this title.', 'collision');
      }
    }
    async function commitChange(head, path, content, message, extra = []) {
      const parent = await api('/git/commits/' + head);
      const tree = await api('/git/trees', 'POST', {base_tree:parent.tree.sha, tree:[{path,mode:'100644',type:'blob',content},...extra]});
      return api('/git/commits','POST',{message,tree:tree.sha,parents:[head]});
    }
    async function publish(input) {
      if (busy) throw fail('A publication is already in progress. Keep this draft open.', 'busy');
      if (!input || !validPath(input.path) || !(input.expectedBlobSha === null || sha(input.expectedBlobSha))) throw fail('Load the current campaign entry before publishing.');
      const {path,content,expectedBlobSha,baseText} = input, contentFields = fields(content);
      if (input.title && input.title !== contentFields.title) throw fail('The entry title does not match its properties.');
      busy = true;
      try {
        await ensureConnected();
        const hash = await crypto.subtle.digest('SHA-256',new TextEncoder().encode(path + '\0' + (expectedBlobSha || '') + '\0' + content));
        const operation = [...new Uint8Array(hash)].map(n=>n.toString(16).padStart(2,'0')).join('');
        const branch = 'entry-editor-' + operation.slice(0,24);
        const main = await mainFile(path), pending = await reviews(), review = onlyReview(pending,path);
        if (review) {
          let meta = await verifyReview(review);
          const branchRef = await ref(review.head.ref), head = branchRef?.object?.sha;
          if (!sha(head)) throw fail('The pending branch is unavailable.', 'conflict');
          if (head !== review.head.sha) meta = await verifyReview(review,head);
          const previous = await file(path,head);
          if (!previous || (main.current?.sha ?? null) !== meta.baseBlob) throw fail('The published entry changed while this draft was pending. Nothing was overwritten.', 'conflict');
          const registry = meta.baseBlob === null ? await file(REGISTRY,main.head) : null;
          const oldRegistry = meta.baseBlob === null ? await file(REGISTRY,meta.baseHead) : null;
          const asset = await chosenAsset(input.asset,meta,head,content), priorMeta = meta;
          // Another entry can publish identical artwork while this review is
          // pending. Rebase the tree on current main when replacing that image
          // so an undeclared old addition never becomes a main-image deletion.
          const retainedMainArt = meta.asset && (!asset || meta.asset.sha256 !== asset.sha256) &&
            await maybe('/contents/' + enc(meta.asset.path) + '?ref=' + encodeURIComponent(main.head));
          const refreshBase = (meta.baseBlob === null && registry?.sha !== oldRegistry?.sha) || !!retainedMainArt;
          meta = withAsset(meta,asset);
          const repairBody = JSON.stringify(metadata(review.body)) !== JSON.stringify(meta);
          if (previous.text === content && !refreshBase && !repairBody) return result(review,head,previous.sha,asset);
          if (previous.text !== content && (previous.sha !== expectedBlobSha || (baseText !== undefined && previous.text !== baseText))) throw fail('The pending entry changed. Load its latest version and reconcile your draft.', 'conflict');
          if (existingTitle(previous.text) !== contentFields.title) await checkNames(path,contentFields.title,main.head,pending);
          const fresh = await api('/pulls/' + review.number);
          if (fresh.state !== 'open' || fresh.merged) throw fail('This revision was already published or closed. Load it again before saving.', 'conflict');
          await verifyReview(fresh);
          let commit;
          if (refreshBase) {
            const registration = [];
            if (meta.baseBlob === null) {
              const line = registryLine(path);
              if (!registry || registry.text.includes(line.trim())) throw fail('Another publication already references this entry name. Reconcile the campaign index before publishing.', 'conflict');
              registration.push({path:REGISTRY,mode:'100644',type:'blob',content:registry.text + line});
            }
            meta = {...meta,baseHead:main.head};
            const artwork = await artworkChanges(path,asset,priorMeta,main.head,main.head,content);
            const parent = await api('/git/commits/' + main.head);
            const tree = await api('/git/trees','POST',{base_tree:parent.tree.sha,tree:[
              {path,mode:'100644',type:'blob',content},...registration,...artwork
            ]});
            commit = await api('/git/commits','POST',{message:'Refresh pending campaign entry: ' + contentFields.title + '\n\n' + reviewBody(meta),tree:tree.sha,parents:[head,main.head]});
          } else {
            const artwork = await artworkChanges(path,asset,priorMeta,head,main.head,content);
            commit = await commitChange(head,path,content,'Revise campaign entry: ' + contentFields.title + '\n\n' + reviewBody(meta),artwork);
          }
          // Metadata first: the synchronize event starts verification with the
          // current base. A retry can recover either side of an interrupted pair.
          if (refreshBase || repairBody) await api('/pulls/' + review.number,'PATCH',{body:reviewBody(meta)});
          await api('/git/refs/heads/' + encodeURIComponent(review.head.ref),'PATCH',{sha:commit.sha,force:false});
          const saved = await file(path,commit.sha), after = await api('/pulls/' + review.number);
          if (after.state !== 'open') throw fail('The revision closed during publication. Your draft is safe; reload to verify the published content.', 'conflict');
          return result(after,commit.sha,saved.sha,asset);
        }
        // Retry a response lost after a branch or review was created. Its
        // deterministic operation ID identifies precisely this submitted text.
        const existing = await ref(branch);
        if (existing) {
          const commit = await api('/git/commits/' + existing.object.sha), meta = metadata(commit.message);
          const previous = await file(path,existing.object.sha);
          if (!meta || meta.path !== path || meta.operation !== operation || meta.baseBlob !== expectedBlobSha || previous?.text !== content) throw fail('A recovery branch has unexpected content. No changes were made.', 'conflict');
          await verifyChanges(meta,existing.object.sha);
          const prior = await api('/pulls?state=all&head=' + encodeURIComponent('Milec:' + branch) + '&per_page=100');
          if (prior.length > 1) throw fail('This publication has ambiguous recovery history.', 'conflict');
          if (prior[0]) {
            await verifyReview(prior[0]);
            if ((prior[0].merged || prior[0].merged_at) && main.current?.text !== content) throw fail('This revision was published, then edited again. Load the latest entry.', 'conflict');
            return result(prior[0],existing.object.sha,previous.sha,await assetFile(meta,existing.object.sha));
          }
          if ((main.current?.sha ?? null) !== meta.baseBlob) throw fail('The entry changed before publication completed. Nothing was overwritten.', 'conflict');
          const pr = await api('/pulls','POST',{title:'Publish entry: ' + contentFields.title,head:branch,base:'main',body:reviewBody(meta)});
          return result(pr,existing.object.sha,previous.sha,await assetFile(meta,existing.object.sha));
        }
        if ((main.current?.sha ?? null) !== expectedBlobSha || (baseText !== undefined && (main.current?.text ?? null) !== baseText)) throw fail('The published entry changed. Load its latest version and reconcile your draft before publishing.', 'conflict');
        if (main.current?.text === content) return {url:null,number:null,branch:null,head:main.head,noteSHA:main.current.sha,status:'unchanged'};
        if (!main.current || existingTitle(main.current.text) !== contentFields.title) await checkNames(path,contentFields.title,main.head,pending);
        const asset = await chosenAsset(input.asset,null,main.head,content);
        const meta = withAsset({path,baseBlob:expectedBlobSha,baseHead:main.head,operation},asset);
        const extra = await artworkChanges(path,asset,null,main.head,main.head,content);
        if (!main.current) {
          const registry = await file(REGISTRY,main.head), line = registryLine(path);
          if (!registry) throw fail('The website publishing index is not available yet. Your draft is safe.', 'remote');
          if (registry.text.includes(line.trim())) throw fail('The campaign index already references this name. Choose a distinct title or restore that existing entry.', 'collision');
          extra.push({path:REGISTRY,mode:'100644',type:'blob',content:registry.text + line});
        }
        const commit = await commitChange(main.head,path,content,'Publish campaign entry: ' + contentFields.title + '\n\n' + reviewBody(meta),extra);
        await api('/git/refs','POST',{ref:'refs/heads/' + branch,sha:commit.sha});
        const pr = await api('/pulls','POST',{title:'Publish entry: ' + contentFields.title,head:branch,base:'main',body:reviewBody(meta)});
        const saved = await file(path,commit.sha);
        return result(pr,commit.sha,saved.sha,asset);
      } finally { busy = false; }
    }
    async function status(number) {
      if (!Number.isSafeInteger(number) || number < 1) throw fail('Invalid publication reference.');
      await ensureConnected();
      const pr = await api('/pulls/' + number), meta = await verifyReview(pr), current = await file(meta.path,pr.head.sha);
      return result(pr,pr.head.sha,current?.sha ?? null,await assetFile(meta,pr.head.sha));
    }
    return Object.freeze({connect,load,publish,status});
  }
  window.SaerothPublisher = Object.freeze({createClient, validPath, fields, repository:REPO});
})();
