import { editor } from '../editor/editor.js';
import { log } from './console.js';

// ── File save / load ───────────────────────────────────────────────────────────
// Uses File System Access API (Chrome/Edge) with fallback to <a download> / <input type="file">.
// Files are only written on explicit user action. (The editor text is also autosaved to
// localStorage — see ui/autosave.js.)

function defaultFileName(){
  const src = editor.getValue();
  for(const line of src.split('\n')){
    const l = line.trim();
    if(l && !l.startsWith(';'))
      return l.slice(0, 30).replace(/[^\w\s\-]/g, '').trim().replace(/\s+/g, '-') || 'program';
  }
  return 'program';
}

// downloadBlob / pickFileWithInput: classic fallbacks, used when the File System
// Access API is missing (Firefox, Safari) or blocked (cross-origin iframes, e.g. itch.io).
function downloadBlob(blob, name){
  const url = URL.createObjectURL(blob);
  const a   = document.createElement('a');
  a.href = url; a.download = name;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function pickFileWithInput(onText){
  const inp  = document.createElement('input');
  inp.type   = 'file';
  inp.accept = '.logo,.txt,text/plain';
  inp.onchange = async function(){
    const file = inp.files[0];
    if(file) onText(await file.text(), file.name);
  };
  inp.click();
}
const LOGO_FILE_TYPES = [{ description: 'Logo program', accept: {'text/plain': ['.logo', '.txt']} }];

async function saveToFile(){
  const blob = new Blob([editor.getValue()], { type: 'text/plain' });
  const name = defaultFileName() + '.logo';
  if(window.showSaveFilePicker){
    try{
      const fh = await window.showSaveFilePicker({ suggestedName: name, types: LOGO_FILE_TYPES });
      const w = await fh.createWritable();
      await w.write(blob);
      await w.close();
      log('Saved: ' + fh.name, 'ok');
      return;
    } catch(e){
      if(e.name === 'AbortError') return; // user cancelled
      // any other error (e.g. SecurityError in a cross-origin iframe) → fallback below
    }
  }
  downloadBlob(blob, name);
  log('Downloaded: ' + name, 'ok');
}

async function loadFromFile(){
  const loaded = (text, name) => { editor.setValue(text); editor.focus(); log('Loaded: ' + name, 'ok'); };
  if(window.showOpenFilePicker){
    try{
      const [fh] = await window.showOpenFilePicker({ types: LOGO_FILE_TYPES, multiple: false });
      const file = await fh.getFile();
      loaded(await file.text(), fh.name);
      return;
    } catch(e){
      if(e.name === 'AbortError') return; // user cancelled
    }
  }
  pickFileWithInput(loaded);
}

document.getElementById('btn-save-file').onclick = saveToFile;
document.getElementById('btn-load-file').onclick = loadFromFile;
