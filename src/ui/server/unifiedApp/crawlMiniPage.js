"use strict";

/**
 * Standalone mini crawl dashboard — a self-contained page optimised for a small
 * window (~600x240), no Control Center shell. Shows the last-24h crawl totals at
 * a glance and gives live feedback as new pages download: the totals count up and
 * a JRPG-style "+N" heal number pops, expands, floats up and fades.
 *
 * Data: polls GET /api/v1/crawl-throughput (real, measured windows) every ~2s and
 * diffs the 24h totals — a jump of N pages fires one "+N" float (batch-per-tick,
 * which matches high-rate crawls). ?demo=1 synthesises increments so the animation
 * can be exercised/inspected without a live crawl.
 *
 * WLILO palette (obsidian ground, gold accents, heal-green for the live signal).
 * No DB access here — it's an HTML shell that calls the JSON route.
 */
function renderCrawlMiniPage() {
  return `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=600, initial-scale=1">
<title>Crawl · mini</title>
<style>
  :root{
    --obsidian:#0b0f1a; --obsidian2:#111828; --leather:#f0ece4; --muted:#8b93a7;
    --gold:#d8cba9; --heal:#54e08a; --heal-dim:#1a8f4d; --line:rgba(216,203,169,.22);
  }
  *{box-sizing:border-box;margin:0;padding:0}
  html,body{height:100%}
  body{
    background:radial-gradient(120% 140% at 20% 0%, #131c30 0%, var(--obsidian) 60%);
    color:var(--leather); font:13px/1.35 "Inter",-apple-system,"Segoe UI",sans-serif;
    overflow:hidden; -webkit-font-smoothing:antialiased;
  }
  .wrap{height:100vh;padding:12px 14px;display:flex;flex-direction:column;gap:8px}
  .top{display:flex;align-items:center;justify-content:space-between;flex:0 0 auto}
  .brand{display:flex;align-items:center;gap:7px;font-family:Georgia,serif;color:var(--gold);
    font-size:13px;letter-spacing:.06em;text-transform:uppercase}
  .brand .spark{color:var(--gold);font-size:12px}
  .status{display:flex;align-items:center;gap:6px;font-size:11px;color:var(--muted);font-variant-numeric:tabular-nums}
  .dot{width:8px;height:8px;border-radius:50%;background:#4b5262;box-shadow:0 0 0 0 rgba(84,224,138,0)}
  .dot.live{background:var(--heal);animation:pulse 1.6s ease-out infinite}
  @keyframes pulse{0%{box-shadow:0 0 0 0 rgba(84,224,138,.55)}70%{box-shadow:0 0 0 7px rgba(84,224,138,0)}100%{box-shadow:0 0 0 0 rgba(84,224,138,0)}}
  .body{flex:1 1 auto;display:grid;grid-template-columns:1.15fr 1fr;gap:14px;align-items:center}
  /* left: live headline */
  .hero{position:relative;height:100%;display:flex;flex-direction:column;justify-content:center;
    border-right:1px solid var(--line);padding-right:12px}
  .hero .big{font-size:58px;font-weight:800;line-height:.95;color:#fff;font-variant-numeric:tabular-nums;
    text-shadow:0 2px 18px rgba(0,0,0,.4)}
  .hero .cap{font-size:11px;color:var(--muted);text-transform:uppercase;letter-spacing:.08em;margin-top:4px}
  .floatLayer{position:absolute;left:0;right:0;top:0;bottom:0;pointer-events:none;overflow:visible}
  .float{position:absolute;top:34%;font-weight:800;color:var(--heal);white-space:nowrap;
    text-shadow:0 0 10px rgba(84,224,138,.7),0 2px 4px rgba(0,0,0,.5);
    animation:heal 1.15s cubic-bezier(.2,.8,.3,1) forwards;transform:translate(-50%,0) scale(.6);opacity:0}
  @keyframes heal{
    0%{opacity:0;transform:translate(-50%,4px) scale(.6)}
    16%{opacity:1;transform:translate(-50%,-6px) scale(var(--peak,1.3))}
    38%{transform:translate(-50%,-14px) scale(1.02)}
    100%{opacity:0;transform:translate(-50%,-48px) scale(1)}
  }
  /* right: compact metrics */
  .grid{display:flex;flex-direction:column;gap:2px;height:100%;justify-content:center}
  .m{display:flex;align-items:baseline;justify-content:space-between;padding:2px 0}
  .m .k{color:var(--muted);font-size:12px}
  .m .v{font-weight:700;font-size:15px;color:var(--leather);font-variant-numeric:tabular-nums}
  .m .v.up{color:var(--heal);transition:color .05s}
  .rule{border-top:1px solid var(--line);margin:5px 0 3px}
  .mini{display:flex;gap:10px;font-size:11px;color:var(--muted);font-variant-numeric:tabular-nums}
  .mini b{color:var(--leather);font-weight:600}
  .badge{position:absolute;bottom:9px;left:14px;font-size:9px;color:#0b0f1a;background:var(--gold);
    padding:1px 6px;border-radius:8px;letter-spacing:.05em;display:none}
  .badge.on{display:inline-block}
</style></head>
<body>
<div class="wrap">
  <div class="top">
    <div class="brand"><span class="spark">&#10022;</span> Crawl rate</div>
    <div class="status"><span class="dot" id="dot"></span><span id="stat">connecting&hellip;</span></div>
  </div>
  <div class="body">
    <div class="hero">
      <div class="big" id="pages">0</div>
      <div class="cap">pages &middot; last 24h</div>
      <div class="floatLayer" id="floatLayer"></div>
    </div>
    <div class="grid">
      <div class="m"><span class="k">&#128196; Documents</span><span class="v" id="docs">0</span></div>
      <div class="m"><span class="k">&#11015; MB downloaded</span><span class="v" id="down">0</span></div>
      <div class="m"><span class="k">&#128451; MB stored</span><span class="v" id="stored">0</span></div>
      <div class="rule"></div>
      <div class="mini">last hr <b id="p1">0</b> &middot; 6h <b id="p6">0</b> &middot; 24h <b id="p24">0</b></div>
    </div>
  </div>
</div>
<span class="badge" id="badge">demo</span>
<script>
(function(){
  var DEMO = /[?&]demo=1/.test(location.search);
  var el = function(id){ return document.getElementById(id); };
  var fmtInt = function(n){ return Number(n||0).toLocaleString('en-US'); };
  var fmtMB = function(b){ var mb=(b||0)/1048576; return mb===0?'0':mb<10?mb.toFixed(2):mb<1000?mb.toFixed(1):Math.round(mb).toLocaleString('en-US'); };
  var st = { pages:0, docs:0, down:0, stored:0, inited:false };

  function countUp(node, from, to, ms){
    if(from===to){ node.textContent=fmtInt(to); return; }
    var t0=performance.now();
    function step(t){
      var k=Math.min(1,(t-t0)/ms); var v=Math.round(from+(to-from)*(1-Math.pow(1-k,3)));
      node.textContent=fmtInt(v); if(k<1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }
  function flashUp(node){ node.classList.add('up'); setTimeout(function(){ node.classList.remove('up'); }, 500); }
  function spawnFloat(n){
    var layer=el('floatLayer'); var f=document.createElement('div'); f.className='float';
    f.textContent='+'+fmtInt(n);
    var peak=Math.min(1.9, 1.2+Math.log(1+n)/6);           // bigger batches pop bigger
    f.style.setProperty('--peak', peak.toFixed(2));
    f.style.left=(48+(Math.random()*20-10))+'%';
    f.style.fontSize=Math.round(20+Math.min(20,n))+'px';
    layer.appendChild(f);
    f.addEventListener('animationend', function(){ f.remove(); });
  }
  // Silent absolute sync from the authoritative DB poll — no float (the SSE
  // stream owns the "+N" pulses; poll only reconciles the true totals).
  function sync(next){
    countUp(el('pages'), st.pages, next.pages, 400);
    el('docs').textContent=fmtInt(next.docs);
    el('down').textContent=fmtMB(next.down);
    el('stored').textContent=fmtMB(next.stored);
    el('p1').textContent=fmtInt(next.p1); el('p6').textContent=fmtInt(next.p6); el('p24').textContent=fmtInt(next.pages);
    st.pages=next.pages; st.docs=next.docs; st.down=next.down; st.stored=next.stored; st.inited=true;
  }
  // Live delta from a lean crawl:download event — the JRPG "+N" heal.
  function pulse(d){
    var p=Math.max(0, d.pages||0);
    if(p>0){ spawnFloat(p); countUp(el('pages'), st.pages, st.pages+p, 500); flashUp(el('pages')); st.pages+=p; }
    if(d.docs){ st.docs+=d.docs; el('docs').textContent=fmtInt(st.docs); flashUp(el('docs')); }
    if(d.bytes){ st.down+=d.bytes; el('down').textContent=fmtMB(st.down); }
    if(d.stored){ st.stored+=d.stored; el('stored').textContent=fmtMB(st.stored); }
    lastSSE=Date.now(); setLive(true,'crawling');
  }
  function setLive(on, text){ el('dot').className='dot'+(on?' live':''); el('stat').textContent=text; }

  var lastSSE=0, es=null;
  function connectSSE(){
    try{
      es=new EventSource('/api/crawl-telemetry/events');
      es.onmessage=function(ev){
        if(!ev||!ev.data||ev.data.charAt(0)!=='{') return;   // skip ':ok' heartbeats
        var f; try{ f=JSON.parse(ev.data); }catch(_){ return; }
        if(f.type!=='crawl:telemetry'||!f.data) return;
        var inner=f.data;
        if(inner.type==='crawl:download' && inner.data){ pulse(inner.data); }
        else if(inner.type==='crawl:progress'){ lastSSE=Date.now(); setLive(true,'crawling'); }
      };
      es.onerror=function(){ /* EventSource auto-reconnects */ };
    }catch(_){}
  }

  async function poll(){
    try{
      var r=await fetch('/api/v1/crawl-throughput',{cache:'no-store'});
      if(!r.ok) throw new Error('HTTP '+r.status);
      var d=await r.json(); var w={}; (d.windows||[]).forEach(function(x){ w[x.label]=x; });
      var t=w['24h']||{}, o=w['1h']||{}, s=w['6h']||{};
      sync({ pages:t.pages||0, docs:t.documents||0, down:t.bytesDownloaded||0, stored:t.bytesStored||0, p1:o.pages||0, p6:s.pages||0 });
      var sseLive = lastSSE && (Date.now()-lastSSE < 8000);
      if(!sseLive) setLive(o.pages>0, (o.pages>0?'active':'idle') + ' \\u00b7 ' + new Date().toLocaleTimeString());
    }catch(e){ if(!lastSSE || Date.now()-lastSSE>8000) setLive(false, 'offline'); }
  }

  if(DEMO){
    el('badge').className='badge on';
    sync({ pages:344, docs:152, down:67.6*1048576, stored:5.06*1048576, p1:0, p6:1 });
    setLive(true,'demo \\u00b7 crawling');
    setInterval(function(){
      var add=1+Math.floor(Math.random()*Math.random()*14);  // skew small, occasional bursts
      pulse({ pages:add, docs:Math.round(add*0.45), bytes:add*90000, stored:add*15000 });
    }, 1200);
  } else {
    poll();                          // authoritative totals now
    setInterval(poll, 12000);        // + slow reconciliation
    connectSSE();                    // instant "+N" via the lean crawl:download stream
  }
})();
</script>
</body></html>`;
}

module.exports = { renderCrawlMiniPage };
