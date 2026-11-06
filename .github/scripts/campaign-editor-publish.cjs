'use strict';

// This module is executed from main, never from the pull request being reviewed.
// All PR content below is data. In particular, no Markdown or metadata is eval'd.
const {TextDecoder}=require('node:util');
const MARKER='<!-- saeroth-entry-editor -->';
const BRANCH=/^entry-editor-[a-z0-9][a-z0-9-]{0,95}$/;
const SHA=/^[a-f0-9]{40}$/;
const MAX_BYTES=128*1024;
const REGISTRY='campaign/world/Campaign Library.md';
const denied=(reason)=>({merged:false,reason:'Entry was not published: '+reason});

function allowedPath(path){
  if(typeof path!=='string'||path.length>450||path.toLowerCase()===REGISTRY.toLowerCase()||!path.startsWith('campaign/')||!path.endsWith('.md')||/[\\%#\[\]\x00-\x1f\x7f<>:"|?*]/.test(path))return false;
  const segments=path.split('/');
  if(segments.length<2||segments.some(segment=>!segment||segment.startsWith('.')||/[. ]$/.test(segment)||/^(?:CON|PRN|AUX|NUL|COM[0-9]|LPT[0-9])(?:\.|$)/i.test(segment)))return false;
  return !/^(?:AGENTS|CLAUDE|SKILL)\.md$/i.test(segments.at(-1));
}

function metadata(body){
  if(typeof body!=='string'||body.length>20000)return null;
  const lines=body.split(/\r?\n/);
  if(lines.filter(line=>line===MARKER).length!==1)return null;
  const entries=lines.filter(line=>line.startsWith('saeroth_entry: '));
  if(entries.length!==1)return null;
  try{
    const meta=JSON.parse(entries[0].slice('saeroth_entry: '.length));
    if(!meta||typeof meta!=='object'||Array.isArray(meta)||Object.keys(meta).sort().join(',')!=='baseBlob,baseHead,operation,path,version')return null;
    if(meta.version!==1||!allowedPath(meta.path)||!(meta.baseBlob===null||SHA.test(meta.baseBlob))||!SHA.test(meta.baseHead)||!/^[a-f0-9]{64}$/.test(meta.operation))return null;
    return meta;
  }catch{return null;}
}

function blobText(data){
  if(!data||data.encoding!=='base64'||!Number.isInteger(data.size)||data.size<1||data.size>MAX_BYTES||typeof data.content!=='string')return null;
  const bytes=Buffer.from(data.content,'base64');if(bytes.length!==data.size||bytes.length>MAX_BYTES)return null;
  let source;try{source=new TextDecoder('utf-8',{fatal:true}).decode(bytes);}catch{return null;}
  return /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(source)?null:source;
}
function validNote(data){
  const source=blobText(data);if(source===null)return false;
  const front=/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(source);if(!front)return false;
  const title=[...front[1].matchAll(/^title:[ \t]*(.*)$/gm)],type=[...front[1].matchAll(/^type:[ \t]*(.*)$/gm)];
  if(title.length!==1||type.length!==1)return false;
  const scalar=raw=>{
    let value=raw.trim();
    if(value.startsWith('"')){try{value=JSON.parse(value);}catch{return null;}}
    else if(value.startsWith("'")){if(!value.endsWith("'"))return null;value=value.slice(1,-1).replace(/''/g,"'");}
    return typeof value==='string'&&!/[\x00-\x1f\x7f]/.test(value)?value.trim():null;
  };
  const name=scalar(title[0][1]),kind=scalar(type[0][1]);
  return name!==null&&kind!==null&&name.length>0&&name.length<=160&&/^[a-z][a-z0-9 -]{0,39}$/i.test(kind);
}

function eligiblePR(pr,run,fullName){
  return pr&&!pr.draft&&pr.base?.ref==='main'&&pr.base.repo?.full_name===fullName&&SHA.test(pr.base.sha||'')
    &&pr.head?.repo?.full_name===fullName&&pr.head.ref===run.head_branch&&pr.head.sha===run.head_sha
    &&typeof pr.user?.login==='string'&&pr.user.login.length>0
    &&(pr.state==='open'||pr.state==='closed'&&pr.merged===true&&SHA.test(pr.merge_commit_sha||''));
}

async function publish({github,context}){
  const run=context.payload.workflow_run,{owner,repo}=context.repo,fullName=`${owner}/${repo}`;
  if(!run||run.status!=='completed'||run.conclusion!=='success'||run.event!=='pull_request'
    ||run.name!=='Verify repository and interface'||run.path!=='.github/workflows/verify.yml'
    ||run.head_repository?.full_name!==fullName||!BRANCH.test(run.head_branch||'')||!SHA.test(run.head_sha||'')
    ||!Number.isSafeInteger(run.id)||run.id<1)return denied('the verification run is not an eligible successful editor run.');

  const candidates=await github.paginate(github.rest.pulls.list,{owner,repo,state:'all',head:`${owner}:${run.head_branch}`});
  if(candidates.length!==1)return denied('there is no single matching editor pull request.');
  const {data:pr}=await github.rest.pulls.get({owner,repo,pull_number:candidates[0].number});
  if(!eligiblePR(pr,run,fullName))return denied('the pull request is a fork, draft, closed, or no longer has the verified commit.');
  const meta=metadata(pr.body);if(!meta)return denied('the editor metadata is missing or invalid.');
  const {data:permission}=await github.rest.repos.getCollaboratorPermissionLevel({owner,repo,username:pr.user.login});
  if(!['write','maintain','admin'].includes(permission.permission))return denied('the author does not currently have repository write access.');

  const jobs=await github.paginate(github.rest.actions.listJobsForWorkflowRun,{owner,repo,run_id:run.id,filter:'latest'});
  if(!jobs.length||!jobs.some(job=>job.name==='verify')||jobs.some(job=>job.status!=='completed'||job.conclusion!=='success'))return denied('the verification jobs have not all succeeded.');

  // Compare immutable SHAs, not pulls.listFiles against a branch that may move
  // while this workflow is running. A stale or malicious replacement branch
  // cannot substitute a different file list for the checked revision.
  const {data:comparison}=await github.rest.repos.compareCommitsWithBasehead({owner,repo,basehead:`${pr.base.sha}...${run.head_sha}`});
  const files=comparison.files;
  if(!Array.isArray(files)||files.length<1||files.length>(meta.baseBlob===null?2:1))return denied('the editor pull request must change one entry and, for a new entry, only its library registration.');
  const file=files.find(item=>item.filename===meta.path),registry=files.find(item=>item.filename===REGISTRY);
  if(!file||files.some(item=>item!==file&&item!==registry))return denied('the change includes a file outside the declared entry and its registration.');
  if(!allowedPath(file.filename)||file.filename!==meta.path||file.previous_filename
    ||!['added','modified'].includes(file.status)||!SHA.test(file.sha||'')
    ||file.status!==(meta.baseBlob===null?'added':'modified'))return denied('the changed file is not the declared added or edited campaign entry.');

  if(meta.baseHead!==pr.base.sha){
    const {data:ancestry}=await github.rest.repos.compareCommitsWithBasehead({owner,repo,basehead:`${meta.baseHead}...${pr.base.sha}`});
    if(!['ahead','identical'].includes(ancestry.status))return denied('the source revision is not part of the main branch history.');
  }
  let original;
  try{({data:original}=await github.rest.repos.getContent({owner,repo,path:meta.path,ref:meta.baseHead}));}
  catch(error){if(error.status!==404)throw error;}
  if(meta.baseBlob===null?!!original:original?.type!=='file'||original.sha!==meta.baseBlob)return denied('the declared source entry revision does not match.');

  const {data:blob}=await github.rest.git.getBlob({owner,repo,file_sha:file.sha});
  if(blob.sha!==file.sha||!validNote(blob))return denied('the entry is not valid UTF-8 Markdown with title and type, or exceeds 128 KiB.');

  if(meta.baseBlob===null){
    const stem=meta.path.split('/').at(-1).slice(0,-3);
    if(/[\[\]#]/.test(stem))return denied('the new entry filename cannot be represented as a library wikilink.');
    const line=`- [[${stem}]]`;
    const {data:existingRegistry}=await github.rest.repos.getContent({owner,repo,path:REGISTRY,ref:pr.base.sha});
    const registryBefore=blobText(existingRegistry);
    if(existingRegistry.type!=='file'||registryBefore===null)return denied('the campaign library could not be validated.');
    if(registry){
      if(registry.status!=='modified'||registry.previous_filename||!SHA.test(registry.sha||''))return denied('the library registration must modify the existing registry.');
      const {data:registryBlob}=await github.rest.git.getBlob({owner,repo,file_sha:registry.sha});
      if(registryBlob.sha!==registry.sha||blobText(registryBlob)!==registryBefore+`\n${line}\n`||registryBefore.split(/\r?\n/).includes(line))return denied('the library change is not the single expected append.');
    }else if(!registryBefore.split(/\r?\n/).includes(line))return denied('the new entry has no existing library registration.');
  }

  // Re-read immediately before the write. The merge API also pins the exact
  // verified head SHA atomically, so a later branch update fails safely.
  const {data:latest}=await github.rest.pulls.get({owner,repo,pull_number:pr.number});
  if(!eligiblePR(latest,run,fullName)||latest.base.sha!==pr.base.sha||latest.user.login!==pr.user.login
    ||JSON.stringify(metadata(latest.body))!==JSON.stringify(meta))return denied('the pull request changed while it was being checked.');
  if(latest.state==='open'){
    let currentEntry;
    try{({data:currentEntry}=await github.rest.repos.getContent({owner,repo,path:meta.path,ref:'main'}));}
    catch(error){if(error.status!==404)throw error;}
    if(meta.baseBlob===null?!!currentEntry:currentEntry?.type!=='file'||currentEntry.sha!==meta.baseBlob)return denied('the entry changed on main after editing began; reconcile the changes before publishing.');
    const {data:result}=await github.rest.pulls.merge({owner,repo,pull_number:pr.number,sha:run.head_sha,merge_method:'squash'});
    if(!result.merged)throw Error('GitHub did not merge the verified campaign entry.');
  }
  // GITHUB_TOKEN merges do not start ordinary push workflows. Explicit dispatch
  // also repairs a prior merge whose dispatch failed, when this run is retried.
  await github.rest.actions.createWorkflowDispatch({owner,repo,workflow_id:'pages.yml',ref:'main'});
  return {merged:true,reason:latest.merged?'The verified entry was already merged; Pages publication was queued.':'The verified entry was merged and Pages publication was queued.'};
}

module.exports=publish;
module.exports.allowedPath=allowedPath;
module.exports.metadata=metadata;
module.exports.validNote=validNote;
