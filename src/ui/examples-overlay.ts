import { editor } from '../editor/editor.ts';
import { EXAMPLES } from '../examples.ts';
import { escHtml } from '../util.ts';
import { byId } from '../util.ts';

(function buildExamples(){
  const overlay=byId('ex-overlay');
  EXAMPLES.forEach(function(ex){
    const item=document.createElement('div');
    item.className='ex-item';
    item.innerHTML='<div class="ex-title">'+escHtml(ex.title)+'</div><div class="ex-desc">'+escHtml(ex.desc)+'</div><pre>'+escHtml(ex.code)+'</pre>';
    item.onclick=function(){
      editor.setValue(ex.code);
      byId('ex-overlay').classList.remove('open');
      editor.focus();
    };
    overlay.appendChild(item);
  });
})();
