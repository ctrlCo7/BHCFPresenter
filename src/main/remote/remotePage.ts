/** The phone/tablet remote: a single self-contained page served by RemoteServer. */
export const REMOTE_PAGE = /* html */ `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1">
<title>BHCF Remote</title>
<style>
:root{--g:#15803d;--g2:#16a34a;--bg:#f4f7f5;--card:#fff;--line:#dfe6e1;--t1:#17211b;--t2:#5b6a61;--red:#dc2626}
*{box-sizing:border-box}body{margin:0;font:15px/1.4 system-ui,-apple-system,Segoe UI,sans-serif;background:var(--bg);color:var(--t1)}
header{background:var(--g);color:#fff;padding:12px 16px;display:flex;justify-content:space-between;align-items:center;position:sticky;top:0;z-index:2}
header b{font-size:16px}#conn{font-size:12px;opacity:.85}
main{padding:12px;max-width:720px;margin:0 auto}
.card{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:12px;margin-bottom:12px}
.status{display:flex;justify-content:space-between;gap:8px;align-items:center}.status .t{font-weight:600}.muted{color:var(--t2);font-size:13px}
.big{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:12px}
button{font:inherit;border:1px solid var(--line);background:#fff;border-radius:10px;padding:12px;color:var(--t1)}
button:active{transform:scale(.98)}
.big button{padding:26px 0;font-size:20px;font-weight:700;background:var(--g2);color:#fff;border:none}
.row{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-bottom:12px}
.row button.on{background:var(--red);color:#fff;border-color:var(--red)}
h3{margin:0 0 8px;font-size:12px;text-transform:uppercase;letter-spacing:.06em;color:var(--t2)}
.slides{display:grid;grid-template-columns:1fr;gap:6px}
.slide{text-align:left;white-space:pre-line;padding:10px}.slide.live{border-color:var(--red);box-shadow:inset 4px 0 0 var(--red)}.slide.off{opacity:.45}
.slide small{display:block;color:var(--t2);font-size:12px}
select{width:100%;padding:10px;border-radius:10px;border:1px solid var(--line);font:inherit;background:#fff}
.timer{display:flex;justify-content:space-between;align-items:center;gap:6px;padding:6px 0;border-top:1px solid var(--line)}
.timer:first-of-type{border-top:none}.timer b{font-variant-numeric:tabular-nums}
#login{max-width:340px;margin:20vh auto;text-align:center}#login input{font-size:28px;text-align:center;letter-spacing:.3em;width:100%;padding:10px;border-radius:10px;border:1px solid var(--line)}
#login button{width:100%;margin-top:10px;background:var(--g2);color:#fff;border:none}
</style></head><body>
<div id="login" hidden><h2>BHCF Remote</h2><p class="muted">Enter the PIN shown in Settings → Remote.</p><input id="pin" inputmode="numeric" maxlength="8" autocomplete="off"><button id="go">Connect</button><p id="err" class="muted"></p></div>
<div id="app" hidden>
<header><b id="proj">BHCF Remote</b><span id="conn">connecting…</span></header>
<main>
<div class="card status"><div><div class="t" id="pres">Nothing live</div><div class="muted" id="pos"></div></div><div class="muted" id="media"></div></div>
<div class="big"><button data-cmd="live.prev">◀ Prev</button><button data-cmd="live.next">Next ▶</button></div>
<div class="row"><button data-cmd="live.black" id="b-black">Black</button><button data-cmd="live.clear" id="b-clear">Clear</button><button data-cmd="live.logo" id="b-logo">Logo</button><button data-cmd="live.clearAll">Clear All</button></div>
<div class="row" style="grid-template-columns:1fr 1fr"><button data-cmd="media.toggle">Play / Pause media</button><button data-cmd="media.stop">Stop media</button></div>
<div class="card"><h3>Playlist</h3><select id="playlist"></select><div id="entries" class="slides" style="margin-top:8px"></div></div>
<div class="card"><h3 id="slides-title">Slides</h3><div id="slides" class="slides"></div></div>
<div class="card"><h3>Timers</h3><div id="timers"></div></div>
</main></div>
<script>
let pin=localStorage.getItem('bhcf-pin')||'';let state=null;let viewId=null;let es=null;
const $=id=>document.getElementById(id);
function esc(s){return String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]))}
async function send(command,args){const r=await fetch('/api/command',{method:'POST',headers:{'content-type':'application/json','x-bhcf-pin':pin},body:JSON.stringify({command,args})});if(r.status===401)logout()}
function logout(){localStorage.removeItem('bhcf-pin');if(es)es.close();$('app').hidden=true;$('login').hidden=false}
async function connect(){const r=await fetch('/api/state?pin='+encodeURIComponent(pin));if(r.status===401){$('err').textContent='Wrong PIN';logout();return}
localStorage.setItem('bhcf-pin',pin);$('login').hidden=true;$('app').hidden=false;render(await r.json());
es=new EventSource('/api/events?pin='+encodeURIComponent(pin));es.addEventListener('state',e=>render(JSON.parse(e.data)));es.onopen=()=>$('conn').textContent='connected';es.onerror=()=>$('conn').textContent='reconnecting…'}
function render(s){if(!s)return;state=s;$('proj').textContent=s.project||'BHCF Remote';const l=s.live;
$('pres').textContent=l.presentationName||'Nothing live';$('pos').textContent=l.slideCount?('Slide '+(l.slideIndex+1)+' of '+l.slideCount):'';
$('media').textContent=l.media?((l.media.playing?'▶ ':'❚❚ ')+l.media.name):'';
$('b-black').classList.toggle('on',l.black);$('b-logo').classList.toggle('on',l.logo);$('b-clear').classList.toggle('on',l.cleared);
const sel=$('playlist');const cur=sel.value;sel.innerHTML=s.playlists.map(p=>'<option value="'+esc(p.id)+'">'+esc(p.name)+'</option>').join('');if(cur&&s.playlists.some(p=>p.id===cur))sel.value=cur;
renderEntries();if(!viewId||!s.presentations[viewId])viewId=l.presentationId;renderSlides();
$('timers').innerHTML=s.timers.length?s.timers.map(t=>'<div class="timer"><span>'+esc(t.name)+' <b>'+esc(t.display)+'</b></span><span><button data-t="timer.'+(t.running?'pause':'start')+'" data-id="'+esc(t.id)+'">'+(t.running?'Pause':'Start')+'</button> <button data-t="timer.reset" data-id="'+esc(t.id)+'">Reset</button></span></div>').join(''):'<div class="muted">No timers</div>'}
function renderEntries(){const p=state.playlists.find(x=>x.id===$('playlist').value);$('entries').innerHTML=p?p.entries.filter(e=>e.kind!=='header'||true).map(e=>e.kind==='header'?'<div class="muted" style="margin-top:6px;font-weight:700">'+esc(e.label)+'</div>':'<button class="slide" data-view="'+esc(e.presentationId||'')+'">'+esc(e.label)+'</button>').join(''):''}
function renderSlides(){const p=viewId&&state.presentations[viewId];$('slides-title').textContent=p?p.name:'Slides';
$('slides').innerHTML=p?p.slides.map((sl,i)=>'<button class="slide'+(state.live.presentationId===p.id&&state.live.slideIndex===i&&!state.live.cleared?' live':'')+(sl.enabled?'':' off')+'" data-slide="'+esc(sl.id)+'"><small>'+(i+1)+(sl.label?' · '+esc(sl.label):'')+'</small>'+esc(sl.text||'—')+'</button>').join(''):'<div class="muted">Pick a presentation from the playlist.</div>'}
document.addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;
if(b.dataset.cmd)send(b.dataset.cmd);else if(b.dataset.view){viewId=b.dataset.view;renderSlides()}
else if(b.dataset.slide)send('live.trigger',{presentationId:viewId,slideId:b.dataset.slide});else if(b.dataset.t)send(b.dataset.t,{timerId:b.dataset.id})});
$('playlist').addEventListener('change',renderEntries);
$('go').onclick=()=>{pin=$('pin').value.trim();connect()};$('pin').addEventListener('keydown',e=>{if(e.key==='Enter')$('go').click()});
if(pin)connect();else{$('login').hidden=false}
</script></body></html>`
