import { editor } from '../editor/editor.ts';
import { pictureCanvas } from '../render/render.ts';
import { log } from './console.ts';
import { byId } from '../util.ts';

// ── File save / load (program) and Save picture (PNG) ───────────────────────────────────────────────────────────
// Uses File System Access API (Chrome/Edge) with fallback to <a download> / <input type="file">.
// Files are only written on explicit user action. (The editor text is also autosaved to
// localStorage — see ui/autosave.ts.)

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
function downloadBlob(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob);
  const a   = document.createElement('a');
  a.href = url; a.download = name;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function pickFileWithInput(onText: (text: string, name: string) => void): void {
  const inp  = document.createElement('input');
  inp.type   = 'file';
  inp.accept = '.logo,.txt,text/plain';
  inp.onchange = async function(){
    const file = inp.files?.[0];
    if(file) onText(await file.text(), file.name);
  };
  inp.click();
}
const LOGO_FILE_TYPES = [{ description: 'Logo program', accept: {'text/plain': ['.logo', '.txt']} }];

const isAbort = (e: unknown): boolean => e instanceof DOMException && e.name === 'AbortError';

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
      if(isAbort(e)) return; // user cancelled
      // any other error (e.g. SecurityError in a cross-origin iframe) → fallback below
    }
  }
  downloadBlob(blob, name);
  log('Downloaded: ' + name, 'ok');
}

async function loadFromFile(){
  const loaded = (text: string, name: string) => { editor.setValue(text); editor.focus(); log('Loaded: ' + name, 'ok'); };
  if(window.showOpenFilePicker){
    try{
      const [fh] = await window.showOpenFilePicker({ types: LOGO_FILE_TYPES, multiple: false });
      const file = await fh.getFile();
      loaded(await file.text(), fh.name);
      return;
    } catch(e){
      if(isAbort(e)) return; // user cancelled
    }
  }
  pickFileWithInput(loaded);
}

// savePicture: the canvas as a PNG (background + drawing, no turtle), named after
// the program like Save. Same picker / download fallback as saveToFile.
const PNG_FILE_TYPES = [{ description: 'PNG picture', accept: {'image/png': ['.png']} }];
async function savePicture(){
  const blob = await new Promise<Blob | null>(res => pictureCanvas().toBlob(res, 'image/png'));
  if(!blob){ log('Could not make the picture', 'err'); return; }
  const name = defaultFileName() + '.png';
  if(window.showSaveFilePicker){
    try{
      const fh = await window.showSaveFilePicker({ suggestedName: name, types: PNG_FILE_TYPES });
      const w = await fh.createWritable();
      await w.write(blob);
      await w.close();
      log('Saved picture: ' + fh.name, 'ok');
      return;
    } catch(e){
      if(isAbort(e)) return; // user cancelled
    }
  }
  downloadBlob(blob, name);
  log('Downloaded picture: ' + name, 'ok');
}

byId('btn-save-file').onclick = saveToFile;
byId('btn-save-pic').onclick = savePicture;
byId('btn-load-file').onclick = loadFromFile;
