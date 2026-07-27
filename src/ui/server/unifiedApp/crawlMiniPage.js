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
  .wrap{height:100vh;padding:10px 14px 8px;display:flex;flex-direction:column;gap:6px}
  .top{display:flex;align-items:center;justify-content:space-between;flex:0 0 auto}
  .brand{display:flex;align-items:center;gap:7px;font-family:Georgia,serif;color:var(--gold);
    font-size:13px;letter-spacing:.06em;text-transform:uppercase}
  .brand .spark{color:var(--gold);font-size:12px}
  .status{display:flex;align-items:center;gap:6px;font-size:11px;color:var(--muted);font-variant-numeric:tabular-nums}
  .dot{width:8px;height:8px;border-radius:50%;background:#4b5262;box-shadow:0 0 0 0 rgba(84,224,138,0)}
  .dot.live{background:var(--heal);animation:pulse 1.6s ease-out infinite}
  @keyframes pulse{0%{box-shadow:0 0 0 0 rgba(84,224,138,.55)}70%{box-shadow:0 0 0 7px rgba(84,224,138,0)}100%{box-shadow:0 0 0 0 rgba(84,224,138,0)}}
  .body{flex:1 1 auto;display:grid;grid-template-columns:1.15fr 1fr;gap:14px;align-items:center;min-height:0}
  /* left: live headline */
  .hero{position:relative;height:100%;display:flex;flex-direction:column;justify-content:center;
    border-right:1px solid var(--line);padding-right:12px}
  .hero .big{font-size:40px;font-weight:800;line-height:.95;color:#fff;font-variant-numeric:tabular-nums;
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
  /* bottom: MB/s sparkline (single series + labeled cap reference line) */
  .spark{flex:0 0 56px;position:relative;border-top:1px solid var(--line);padding-top:3px}
  .spark .cap-row{display:flex;justify-content:space-between;align-items:baseline;font-size:9.5px;
    color:var(--muted);letter-spacing:.04em}
  .spark .cap-row b{color:var(--leather);font-weight:600;font-variant-numeric:tabular-nums}
  .spark svg{display:block;width:100%;height:40px}
  .spark .tip{position:absolute;pointer-events:none;display:none;background:#1b2438;color:var(--leather);
    font-size:9.5px;padding:2px 6px;border-radius:3px;border:1px solid var(--line);white-space:nowrap;
    font-variant-numeric:tabular-nums;transform:translate(-50%,-130%)}
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
  <div class="spark" id="spark">
    <div class="cap-row">
      <span>&#9207; MB/s &middot; last hour &middot; now <b id="rateNow">0.00</b></span>
      <span id="capLabel">cap &mdash;</span>
    </div>
    <svg id="sparkSvg" viewBox="0 0 572 40" preserveAspectRatio="none" aria-label="Download rate, MB per second, last hour"></svg>
    <div class="tip" id="sparkTip"></div>
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

  // ── MB/s sparkline (single series + labeled cap reference) ────────────────
  // Emitted from a template literal: no backslash-regex, no backticks here.
  var SVGNS='http://www.w3.org/2000/svg';
  var sparkData=[], sparkCap=0, sparkMax=0.01;
  function svgEl(tag, attrs){ var n=document.createElementNS(SVGNS, tag);
    for(var k in attrs) n.setAttribute(k, attrs[k]); return n; }
  function drawSpark(){
    var svg=el('sparkSvg'); if(!svg) return;
    while(svg.firstChild) svg.removeChild(svg.firstChild);
    var W=572, H=40, n=sparkData.length; if(!n) return;
    var mbps=sparkData.map(function(p){ return (p.bytes||0)/1048576/60; });
    var dataMax=Math.max.apply(null, mbps);
    sparkMax=Math.max(dataMax, sparkCap>0?sparkCap*1.08:0, 0.01);
    var xs=function(i){ return i*(W/(n-1)); };
    var ys=function(v){ return H-2-(v/sparkMax)*(H-6); };
    // area fill (translucent series color) + 2px line on top
    var d='M0,'+(H-2);
    for(var i=0;i<n;i++){ d+=' L'+xs(i).toFixed(1)+','+ys(mbps[i]).toFixed(1); }
    d+=' L'+W+','+(H-2)+' Z';
    svg.appendChild(svgEl('path',{d:d, fill:'rgba(84,224,138,.16)', stroke:'none'}));
    var dl='';
    for(var j=0;j<n;j++){ dl+=(j?' L':'M')+xs(j).toFixed(1)+','+ys(mbps[j]).toFixed(1); }
    svg.appendChild(svgEl('path',{d:dl, fill:'none', stroke:'#54e08a', 'stroke-width':'2',
      'stroke-linejoin':'round', 'stroke-linecap':'round'}));
    // cap reference line: dashed gold, labeled in the header row (never color-alone)
    if(sparkCap>0){
      var cy=ys(sparkCap);
      svg.appendChild(svgEl('line',{x1:0,y1:cy,x2:W,y2:cy, stroke:'#d8cba9',
        'stroke-width':'1','stroke-dasharray':'4 3', opacity:'0.75'}));
    }
    // baseline (recessive)
    svg.appendChild(svgEl('line',{x1:0,y1:H-1,x2:W,y2:H-1, stroke:'rgba(216,203,169,.18)','stroke-width':'1'}));
    var nowMbps=mbps[n-1]||0;
    el('rateNow').textContent=nowMbps<10?nowMbps.toFixed(2):nowMbps.toFixed(1);
  }
  function sparkTipShow(evt){
    var svg=el('sparkSvg'), tip=el('sparkTip'); if(!svg||!tip||!sparkData.length) return;
    var r=svg.getBoundingClientRect();
    var frac=Math.max(0, Math.min(1, (evt.clientX-r.left)/r.width));
    var i=Math.round(frac*(sparkData.length-1));
    var p=sparkData[i]; if(!p) return;
    var v=(p.bytes||0)/1048576/60;
    var hhmm=String(p.t||'').slice(11,16);
    tip.textContent=hhmm+' UTC \\u00b7 '+(v<10?v.toFixed(2):v.toFixed(1))+' MB/s';
    tip.style.left=(evt.clientX-r.left+14)+'px';
    tip.style.top='14px';
    tip.style.display='block';
  }
  function sparkTipHide(){ var tip=el('sparkTip'); if(tip) tip.style.display='none'; }
  async function pollSpark(){
    try{
      var r=await fetch('/api/v1/crawl-rate-timeseries',{cache:'no-store'});
      if(r.ok){ var d=await r.json(); sparkData=d.points||[]; }
      var c=await fetch('/api/v1/crawl/bandwidth-cap',{cache:'no-store'});
      if(c.ok){ var cd=await c.json(); sparkCap=cd.unlimited?0:(cd.rateMBps||0);
        el('capLabel').textContent = cd.unlimited ? 'cap off' : ('cap '+sparkCap.toFixed(1)+' MB/s');
      }
      drawSpark();
    }catch(e){ /* transient — keep last drawing */ }
  }

  var lastSSE=0, es=null, pageLoadedAt=Date.now();
  function connectSSE(){
    try{
      es=new EventSource('/api/crawl-telemetry/events');
      es.onmessage=function(ev){
        if(!ev||!ev.data||ev.data.charAt(0)!=='{') return;   // skip ':ok' heartbeats
        var f; try{ f=JSON.parse(ev.data); }catch(_){ return; }
        if(f.type!=='crawl:telemetry'||!f.data) return;
        var inner=f.data;
        // SSE replays bridge history on connect — a fresh page would fire a burst
        // of stale "+N" floats for old downloads. Only pulse for events newer
        // than page load (with 2s clock slack); older frames are history.
        var ts=inner.timestampMs || (inner.timestamp ? Date.parse(inner.timestamp) : 0);
        if(ts && ts < pageLoadedAt - 2000) return;
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

  var sparkSvgEl=el('sparkSvg');
  if(sparkSvgEl){
    sparkSvgEl.addEventListener('mousemove', sparkTipShow);
    sparkSvgEl.addEventListener('mouseleave', sparkTipHide);
  }

  if(DEMO){
    el('badge').className='badge on';
    sync({ pages:344, docs:152, down:67.6*1048576, stored:5.06*1048576, p1:0, p6:1 });
    setLive(true,'demo \\u00b7 crawling');
    setInterval(function(){
      var add=1+Math.floor(Math.random()*Math.random()*14);  // skew small, occasional bursts
      pulse({ pages:add, docs:Math.round(add*0.45), bytes:add*90000, stored:add*15000 });
    }, 1200);
    // synthetic hour of rate data so the sparkline can be inspected offline
    sparkCap=4;
    el('capLabel').textContent='cap 4.0 MB/s';
    sparkData=[];
    var demoNow=Date.now();
    for(var di=59;di>=0;di--){
      var dt=new Date(demoNow-di*60000); dt.setUTCSeconds(0,0);
      var wave=Math.max(0, Math.sin((59-di)/9)*2.2+1.9+(Math.random()*0.8-0.4));
      sparkData.push({ t:dt.toISOString(), bytes:wave*60*1048576, fetches:Math.round(wave*4) });
    }
    drawSpark();
  } else {
    poll();                          // authoritative totals now
    setInterval(poll, 12000);        // + slow reconciliation
    connectSSE();                    // instant "+N" via the lean crawl:download stream
    pollSpark();                     // MB/s sparkline + cap line
    setInterval(pollSpark, 15000);
  }
})();
</script>
</body></html>`;
}

module.exports = { renderCrawlMiniPage };
