import { editor } from '../editor/editor.js';
import { EXAMPLES } from '../examples.js';
import { escHtml } from '../util.js';

(function buildExamples(){
  const overlay=document.getElementById('ex-overlay');
  EXAMPLES.forEach(function(ex){
    const item=document.createElement('div');
    item.className='ex-item';
    item.innerHTML='<div class="ex-title">'+escHtml(ex.title)+'</div><div class="ex-desc">'+escHtml(ex.desc)+'</div><pre>'+escHtml(ex.code)+'</pre>';
    item.onclick=function(){
      editor.setValue(ex.code);
      document.getElementById('ex-overlay').classList.remove('open');
      editor.focus();
    };
    overlay.appendChild(item);
  });
})();
