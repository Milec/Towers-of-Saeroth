/** One IndexedDB document, committed with a revision check inside its transaction. */
export class SessionLibraryError extends Error {
  constructor(message,code,cause){super(message,{cause});this.name='SessionLibraryError';this.code=code;}
}

export function createSessionStore({name,model,indexedDB=globalThis.indexedDB}={}) {
  if(typeof name!=='string'||!name||name.length>300)throw Error('Invalid session-library storage name.');
  if(!model||typeof model.normalizeLibrary!=='function'||typeof model.emptyLibrary!=='function')throw Error('A session-library model is required.');
  let connection=null,opening=null,epoch=0;
  function open(){
    if(connection)return Promise.resolve(connection);
    if(opening)return opening;
    const ticket=epoch;
    opening=new Promise((resolve,reject)=>{
      if(!indexedDB){reject(new SessionLibraryError('Saved-session storage is unavailable in this browser. Download the current session to keep it.','UNAVAILABLE'));return;}
      let request;
      try{request=indexedDB.open(name,1);}catch(error){reject(new SessionLibraryError('Saved-session storage could not open. Your current preparation is unchanged.','UNAVAILABLE',error));return;}
      let settled=false;
      request.onupgradeneeded=()=>{if(!request.result.objectStoreNames.contains('library'))request.result.createObjectStore('library');};
      request.onerror=()=>{if(!settled){settled=true;reject(new SessionLibraryError('Saved-session storage could not open. Your current preparation is unchanged.','UNAVAILABLE',request.error));}};
      request.onblocked=()=>{if(!settled){settled=true;reject(new SessionLibraryError('Another tab is blocking the session library. Close older Saeroth tabs and retry.','BLOCKED'));}};
      request.onsuccess=()=>{
        if(settled){request.result.close();return;}
        if(ticket!==epoch){settled=true;request.result.close();reject(new SessionLibraryError('The session library was closed. Reopen it to continue.','UNAVAILABLE'));return;}
        settled=true;const db=request.result;connection=db;
        db.onversionchange=()=>{db.close();if(connection===db)connection=null;};
        resolve(db);
      };
    }).finally(()=>{opening=null;});
    return opening;
  }
  async function readRaw(){
    const db=await open();return new Promise((resolve,reject)=>{
      let value,transaction;
      try{transaction=db.transaction('library','readonly');const request=transaction.objectStore('library').get('current');request.onsuccess=()=>{value=request.result;};}
      catch(error){reject(new SessionLibraryError('The session library could not be read. Your current preparation is unchanged.','UNAVAILABLE',error));return;}
      transaction.oncomplete=()=>resolve(value);
      transaction.onabort=transaction.onerror=()=>reject(new SessionLibraryError('The session library could not be read. Your current preparation is unchanged.','UNAVAILABLE',transaction.error));
    });
  }
  function normalizeStored(raw){
    if(raw===undefined)return model.emptyLibrary();
    try{return model.normalizeLibrary(raw);}catch(error){throw new SessionLibraryError('The saved-session library could not be read safely. Download its recovery data before making changes.','UNREADABLE',error);}
  }
  async function read(){return normalizeStored(await readRaw());}
  async function write(value,{expectedRevision}={}){
    const next=model.normalizeLibrary(value);
    if(!Number.isSafeInteger(expectedRevision)||expectedRevision<0||next.revision!==expectedRevision+1)throw new SessionLibraryError('The library update has an invalid revision. Refresh the saved sessions and try again.','CONFLICT');
    const db=await open();return new Promise((resolve,reject)=>{
      let transaction,failure=null;
      try{
        transaction=db.transaction('library','readwrite');const store=transaction.objectStore('library'),request=store.get('current');
        request.onsuccess=()=>{
          try{
            const current=normalizeStored(request.result);
            if(current.revision!==expectedRevision)throw new SessionLibraryError('Saved sessions changed in another tab. Refresh the library before trying again. Your working preparation is unchanged.','CONFLICT');
            store.put(next,'current');
          }catch(error){failure=error;transaction.abort();}
        };
      }catch(error){reject(new SessionLibraryError('The session could not be saved. Your working preparation is unchanged; download a backup to keep it.','UNAVAILABLE',error));return;}
      transaction.oncomplete=()=>resolve(next);
      transaction.onabort=transaction.onerror=()=>reject(failure??new SessionLibraryError('The session could not be saved. Your working preparation is unchanged; download a backup to keep it.','UNAVAILABLE',transaction.error));
    });
  }
  function close(){epoch++;connection?.close();connection=null;}
  return Object.freeze({read,readRaw,write,close});
}
