/* ui.js — FRONTEND van de Auto-agenda
   Bevat alles wat met het scherm te maken heeft: invoervelden, lijsten, popups en kaartjes.
   Alle berekeningen gebeuren in planner.js (object Planner). Dit bestand bevat zelf geen planninglogica. */
const $=id=>document.getElementById(id);
const {dstr,pdate,key,parseICS,parseTasks}=Planner,ll=g=>[g[1],g[0]];
let events=[],tasks=[],plan=[],lastEvs=[],lunches=[],travels=[],doneT={},view=[],planned=false,dayMap={},OF=null,map=null;
const f2=n=>String(n).padStart(2,'0');
const esc=s=>String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const tm=d=>d.toLocaleTimeString('nl-BE',{hour:'2-digit',minute:'2-digit'});
$('from').value=dstr(new Date());

// ---------- Bestanden inlezen ----------
$('fi').onchange=async e=>{const f=e.target.files[0];if(!f)return;
 events=parseICS(await f.text());$('si').textContent=events.length+' afspraken ingelezen (hele-dag-items worden genegeerd).';};
$('ft').onchange=async e=>{const f=e.target.files[0];if(!f)return;
 const wb=XLSX.read(await f.arrayBuffer(),{cellDates:true});
 doneT={};const u=Planner.uniqueTasks(parseTasks(XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]])));tasks=u.list;
 $('st').textContent=tasks.length+' taken ingelezen, samen '+Math.round(tasks.reduce((a,t)=>a+t.min,0)/6)/10+' uur.'+(u.dropped?' '+u.dropped+' dubbele naam/namen genegeerd.':'');};
$('tpl').onclick=async e=>{e.preventDefault();
 const csv='Taak,Duur (uren),Deadline,Prioriteit,Locatie,Niet splitsen,Startdatum\nOfferte opstellen,1.5,2026-10-09,1,,ja,\nMails beantwoorden,0.75,,3,,,\nOpmeting werf,2,2026-10-16,2,Gent,ja,2026-10-12\n';
 saveFile('taken-voorbeeld.csv',csv,'text/csv');};


// ---------- Kaart ----------
const STY={version:8,sources:{o:{type:'raster',tiles:['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],tileSize:256,attribution:'© OpenStreetMap'}},layers:[{id:'o',type:'raster',source:'o'}]};
function closeMap(){if(map){map.remove();map=null}}
function showMap(pts){
 closeMap();pts=(pts||[]).filter(Boolean);
 if(!$('map')||!pts.length||typeof maplibregl==='undefined')return;
 const lg=$('lg'),two=new Set(pts.map(key)).size>1,isO=OF&&key(pts[0])===key(OF),D=(c,x)=>'<span class="dot" style="background:'+c+'"></span>'+x;
 if(lg)lg.innerHTML=two?D('#2f6fed','Start / kantoor')+D('#d9480f','Locatie')+'<span class="dot" style="background:#2f6fed;border-radius:2px;height:4px;width:16px"></span>Route':(isO?D('#2f6fed','Kantoor'):D('#d9480f','Locatie'));
 map=new maplibregl.Map({container:'map',style:STY,center:ll(pts[pts.length-1]),zoom:13});
 map.addControl(new maplibregl.NavigationControl({showCompass:false}));
 const seen=new Set();
 pts.forEach((g,i)=>{if(seen.has(key(g)))return;seen.add(key(g));new maplibregl.Marker({color:(OF&&key(g)===key(OF))||(i===0&&pts.length>1)?'#2f6fed':'#d9480f'}).setLngLat(ll(g)).addTo(map)});
 if(seen.size<2)return;
 map.on('load',async()=>{const r=await Planner.route(pts);if(!r||!map)return;
  map.addSource('r',{type:'geojson',data:{type:'Feature',geometry:r.geometry}});
  map.addLayer({id:'r',type:'line',source:'r',paint:{'line-color':'#2f6fed','line-width':4}});
  const c=r.geometry.coordinates;map.fitBounds(c.reduce((B,q)=>B.extend(q),new maplibregl.LngLatBounds(c[0],c[0])),{padding:40,duration:0});
  $('ri').textContent='Route: '+Math.round(r.distance/100)/10+' km · '+Math.round(r.duration/60)+' min rijden (zonder file)';});}
function openDay(k){
 const day=dayMap[k]||[],it=day.filter(x=>x.geo&&!(x.task&&doneT[x.tid])).sort((a,b)=>a.start-b.start),pts=OF?[OF]:[];
 const office=day.some(x=>x.task&&!x.loc&&!doneT[x.tid]),MH='<div id="map"></div><div class="mu" id="lg"></div><div class="mu" id="ri"></div>';
 it.forEach(x=>{if(!pts.length||key(pts[pts.length-1])!==key(x.geo))pts.push(x.geo)});
 if(OF&&key(pts[pts.length-1])!==key(OF))pts.push(OF);
 let body='<div class="mu">Geen locaties op deze dag.</div>',show=false;
 if(it.length){show=true;body='<ul>'+it.map(x=>'<li>'+tm(x.start)+' '+esc(x.name||'')+' <span class="mu">'+esc((x.loc||'').split(',')[0])+'</span></li>').join('')+'</ul>'+MH}
 else if(office&&OF){show=true;body='<div>Alle taken van deze dag zijn op kantoor'+($('office').value.trim()?': '+esc($('office').value.trim()):'')+'.</div>'+MH}
 $('mb').innerHTML='<b>'+new Date(k+'T00:00').toLocaleDateString('nl-BE',{weekday:'long',day:'numeric',month:'long'})+'</b>'+body;
 $('ov').hidden=false;if(show)showMap(pts);}
// ---------- Adressen aanvullen ----------
let sgT;document.addEventListener('input',ev=>{if(!['nl','el'].includes(ev.target.id))return;clearTimeout(sgT);const v=ev.target.value.trim();if(v.length<4)return;
 sgT=setTimeout(async()=>{const r=await Planner.suggest(v);$('dl').innerHTML=r.map(n=>'<option value="'+esc(n)+'">').join('')},1200)});

// ---------- Notities ----------
let NT={};try{NT=JSON.parse(localStorage.getItem('nt2')||'{}')}catch(e){}
const svN=()=>{try{localStorage.setItem('nt2',JSON.stringify(NT))}catch(e){}};
const noteKey=x=>x.task?'t|'+tasks[x.tid].name.toLowerCase():'e|'+(x.name||'')+'|'+(+x.start);
function detail(x){const k=(x.task||x.src)?noteKey(x):null;
 return detailB(x)+(k?'<div style="margin-top:10px"><label>📝 Notitie<textarea id="nt" rows="3" data-k="'+esc(k)+'" data-i="'+x.i+'" placeholder="Schrijf hier een notitie…">'+esc(NT[k]||'')+'</textarea></label></div>':'')}
document.addEventListener('input',ev=>{if(ev.target.id!=='nt')return;const k=ev.target.dataset.k,v=ev.target.value;if(v.trim())NT[k]=v;else delete NT[k];svN();
 const it=document.querySelector('.it[data-i="'+ev.target.dataset.i+'"]'),m=it&&it.querySelector('.nm');if(m)m.hidden=!v.trim()});   // 📝 meteen tonen/verbergen

// ---------- Vaste afspraken aanpassen (alleen in deze sessie, je agenda zelf verandert niet) ----------
function editEvent(i){
 const x=view[i],f='style="width:100%;box-sizing:border-box"',T=d=>f2(d.getHours())+':'+f2(d.getMinutes());
 closeMap();$('mb').innerHTML='<b>Afspraak aanpassen</b>'+(x.src.rr?'<div class="mu">Terugkerende afspraak: alleen deze keer wordt aangepast.</div>':'')+'<div class="row" style="margin-top:8px">'
  +'<label style="width:100%">Titel<input id="vn" '+f+' value="'+esc(x.name||'')+'"></label>'
  +'<label>Datum<input type="date" id="vd" value="'+dstr(x.start)+'"></label>'
  +'<label>Van<input type="time" id="vs" value="'+T(x.start)+'"></label><label>Tot<input type="time" id="ve" value="'+T(x.end)+'"></label>'
  +'<label style="width:100%">Locatie<input id="el" list="dl" '+f+' value="'+esc(x.loc||'')+'"></label></div>'
  +'<div class="mu" id="vm" style="margin-top:6px">Dit past alleen de planner aan. Wijzig je agenda zelf ook, of laad hem later opnieuw in.</div>'
  +'<div style="margin-top:8px"><button class="p" id="evs" data-i="'+i+'">Opslaan</button> <button id="evd" data-i="'+i+'">Afspraak schrappen</button> <button id="ec">Annuleren</button></div>';
 $('ov').hidden=false;}
function saveEvent(i,del){
 const x=view[i],s0=x.src,k0=noteKey(x),again=()=>{shut();if(planned)$('go').onclick()};
 if(del){if(s0.rr)(s0.ex=s0.ex||[]).push(x.ok);else events.splice(events.indexOf(s0),1);again();return}
 const d=$('vd').value,a=$('vs').value,b=$('ve').value,L=$('el').value.trim();
 if(!d||!a||!b){$('vm').textContent='Vul een datum en beide uren in.';return}
 const st=new Date(d+'T'+a),off=Math.round((new Date(x.end.getFullYear(),x.end.getMonth(),x.end.getDate())-new Date(x.start.getFullYear(),x.start.getMonth(),x.start.getDate()))/864e5),hm=b.split(':').map(Number);
 const en=new Date(st.getFullYear(),st.getMonth(),st.getDate()+off,hm[0],hm[1]);
 if(!(en>st)){$('vm').textContent='Het einduur moet na het beginuur liggen.';return}
 const nv={name:$('vn').value.trim(),start:st,end:en,loc:L,geo:L===(x.loc||'')?x.geo:null};     // nieuwe locatie wordt opnieuw opgezocht
 if(s0.rr){(s0.ex=s0.ex||[]).push(x.ok);events.push(nv)}else Object.assign(s0,nv);
 const k1='e|'+nv.name+'|'+(+st);if(k0!==k1&&NT[k0]){NT[k1]=NT[k0];delete NT[k0];svN()}
 again();}

// ---------- Inplannen (vraagt de backend om de planning) ----------
$('go').onclick=async()=>{
 if(!tasks.length){alert('Laad eerst een takenlijst.');return}
 const hm=v=>v.split(':').map(Number),b=$('base').value.split(',').map(parseFloat);
 const res=await Planner.run({events,tasks,doneT,from:new Date($('from').value+'T00:00'),days:+$('days').value,
  ws:hm($('ws').value),we:hm($('we').value),weekend:$('wk').checked,lunchStart:hm($('ls').value),lunchMin:+$('ld').value||0,
  minBlock:+$('minc').value,defaultTravel:+$('buf').value,office:$('office').value.trim(),officeCoords:b.length===2&&!b.some(isNaN)?b:null,
  bundle:$('bun').checked,radius:+$('rad').value||0,onStatus:t=>{$('gs').textContent=t}});
 ({plan,travels,lunches,lastEvs}=res);OF=res.office;$('gs').textContent=res.status;
 render(res.q);planned=true;};

// ---------- Weergave ----------
const PAL=['#2f6fed','#d9480f','#2b8a3e','#9c36b5','#c2255c','#0b7285','#e8590c','#5f3dc4'];
const fmtH=m=>((m>=60?Math.floor(m/60)+' u':'')+(m%60?' '+(m%60)+' min':'')).trim()||'0 min';
function render(q,start,days){
 const map={},grp={};
 plan.forEach(x=>(grp[x.tid]=grp[x.tid]||[]).push(x));          // delen van dezelfde taak groeperen
 Object.values(grp).forEach(a=>{a.sort((p,r)=>p.start-r.start);a.forEach((x,i)=>{x.part=i+1;x.parts=a.length})});
 view=[...lastEvs.map(e=>({...e,task:false})),...lunches,...travels,...plan];
 view.forEach((x,i)=>{x.i=i;const k=dstr(x.start);(map[k]=map[k]||[]).push(x)});
 dayMap=map;let h='';const left=q.filter(t=>t.left>0);
 if(left.length)h+='<div class="card wa"><b>Niet ingepland:</b> '+left.map(t=>esc(t.name)+' ('+t.left+' min'+(t.dl?', deadline '+dstr(t.dl):'')+(t.ns?', niet splitsbaar – geen gat groot genoeg':'')+')').join(', ')+'</div>';
 else h+='<div class="card">✅ Alle taken zijn ingepland. <button id="ex">Exporteer planning</button> <span class="mu">(downloadt planning.ics: open het bestand om de taken in Apple Agenda te zetten)</span></div>';
 h+='<div class="card"><h2>Taken</h2>'+tasks.map((t,i)=>'<label class="tk"><input type="checkbox" data-k="'+i+'"'+(doneT[i]?' checked':'')+'><i style="background:'+PAL[i%PAL.length]+'"></i><span'+(doneT[i]?' class="dn"':'')+'>'+esc(t.name)+'</span><span class="mu">'+fmtH(t.min)+'</span><button class="ed" data-e="'+i+'" title="Aanpassen">✏️</button></label>').join('')+'</div>';
 h+='<div class="mu" style="margin-bottom:6px">Tik op een item voor details. Vink een taak af in de lijst "Taken" en druk op "Plan in" om de rest opnieuw in te plannen.</div>';
 Object.keys(map).sort().forEach(k=>{
  const d=new Date(k+'T00:00');
  h+='<div class="day">'+d.toLocaleDateString('nl-BE',{weekday:'long',day:'numeric',month:'long'})+' <button class="dm" data-day="'+k+'">🗺 Dagkaart</button></div>';
  map[k].sort((a,b)=>a.start-b.start).forEach(x=>{
   h+='<div class="it'+(x.task?' t':'')+(x.task&&doneT[x.tid]?' done':'')+(x.travel?' tv':'')+'" data-i="'+x.i+'"'+(x.task?' data-t="'+x.tid+'" style="border-left:4px solid '+PAL[x.tid%PAL.length]+'"':'')+'>'
    +'<b>'+tm(x.start)+' – '+tm(x.end)+'</b><span>'+(x.task||x.travel?'':'📌 ')+esc(x.name||'(afspraak)')+((x.task||x.src)?'<span class="nm"'+(NT[noteKey(x)]?'':' hidden')+'> 📝</span>':'')
    +(x.travel?' <span class="mu">· '+Math.round((x.end-x.start)/6e4)+' min</span>':'')+(x.parts>1?' <span class="mu">· deel '+x.part+'/'+x.parts+'</span>':'')
    +(x.loc?' <span class="mu">· '+esc(x.loc.split(',')[0])+(x.tr?' · '+x.tr+(x.task?' min reis ervoor':' min reistijd (kantoor ↔ afspraak)'):'')+'</span>':'')
    +'</span></div>'});});
 $('out').innerHTML=h;
 const ex=$('ex');if(ex)ex.onclick=exportICS;}

function detailB(x){const g=x.geo||(x.task&&!x.loc&&OF?OF:null);       // taak op kantoor: kantoor aanduiden
 return detail0(x)+(!x.task&&x.src?'<div style="margin-top:8px"><button data-ev="'+x.i+'">✏️ Afspraak aanpassen</button></div>':'')+(x.task?'<div style="margin-top:8px"><button data-e="'+x.tid+'">✏️ Taak aanpassen</button></div>':'')+(g?'<div id="map"></div><div class="mu" id="lg"></div><div class="mu" id="ri"></div><div style="margin-top:6px"><a href="https://maps.apple.com/?daddr='+g+'" target="_blank">Navigeer met Apple Kaarten</a> · <a href="https://www.google.com/maps/dir/?api=1&destination='+g+'" target="_blank">Google Maps</a></div>':'')}
function detail0(x){
 const f=d=>d.toLocaleDateString('nl-BE',{weekday:'short',day:'numeric',month:'short'});
 const r=(a,b)=>b?'<div><span class="mu">'+a+':</span> '+b+'</div>':'';
 if(!x.task)return r('Afspraak',esc(x.name||''))+r('Tijd',tm(x.start)+' – '+tm(x.end))+r('Locatie',esc(x.loc||''))+r('Reistijd',x.tr?x.tr+' min enkele rit (kantoor ↔ afspraak)':'');
 const t=tasks[x.tid],ch=plan.filter(p=>p.tid===x.tid).sort((a,b)=>a.start-b.start),dm=doneT[x.tid];
 return r('Taak',esc(t.name))+r('Totale duur',fmtH(t.min))+r('Status',dm?'afgewerkt ✓':'')+r('Starten vanaf',t.sd?f(t.sd):'zo snel mogelijk')+r('Deadline',t.dl?f(t.dl):'')
  +r('Prioriteit',t.prio)+r('Locatie',esc(t.loc||'kantoor'))+r('Splitsen',t.ns?'niet toegestaan':'toegestaan')+r('Reistijd ervoor',x.tr?x.tr+' min':'')
  +(ch.length>1?r('Alle delen','<br>'+ch.map(p=>f(p.start)+' '+tm(p.start)+'–'+tm(p.end)+(dm?' ✓':'')).join('<br>')):'');}

$('out').onclick=e=>{
 const eb=e.target.closest('[data-e]');if(eb){editTask(+eb.dataset.e);return}
 const db=e.target.closest('[data-day]');if(db){openDay(db.dataset.day);return}
 const cb=e.target.closest('input[data-k]');
 if(cb){const k=cb.dataset.k;doneT[+k]=cb.checked;                 // hele taak afvinken: alle delen doorstrepen
  cb.closest('.tk').querySelector('span').classList.toggle('dn',cb.checked);
  document.querySelectorAll('.it[data-t="'+k+'"]').forEach(i=>i.classList.toggle('done',cb.checked));return}
 const it=e.target.closest('.it');if(!it)return;
 const x=view[+it.dataset.i];
 if(x.travel)return;
 $('mb').innerHTML=detail(x);$('ov').hidden=false;showMap(x.geo?[x.fr||OF,x.geo]:(x.task&&!x.loc&&OF?[OF]:null));};                  // popup met info
const shut=()=>{$('ov').hidden=true;closeMap()};
$('ov').onclick=e=>{if(e.target.id==='ov')shut()};
$('cl').onclick=shut;
$('mb').onclick=e=>{const eb=e.target.closest('[data-e]');if(eb)editTask(+eb.dataset.e);const ev=e.target.closest('[data-ev]');if(ev)editEvent(+ev.dataset.ev);
 if(e.target.id==='ec')shut();if(e.target.id==='es')saveTask(+e.target.dataset.i);if(e.target.id==='evs')saveEvent(+e.target.dataset.i);if(e.target.id==='evd')saveEvent(+e.target.dataset.i,true)};
function editTask(i){                                                  // taak aanpassen in popup
 const t=tasks[i],f='style="width:100%;box-sizing:border-box"';
 closeMap();$('mb').innerHTML='<b>Taak aanpassen</b><div class="row" style="margin-top:8px">'
  +'<label style="width:100%">Taak<input id="en" '+f+' value="'+esc(t.name)+'"></label>'
  +'<label>Duur (uren)<input type="number" id="ed" min="0.25" step="0.25" value="'+Math.round(t.min/6)/10+'"></label>'
  +'<label>Starten vanaf (leeg = nu)<input type="date" id="esd" value="'+(t.sd?dstr(t.sd):'')+'"></label>'
  +'<label>Deadline<input type="date" id="edl" value="'+(t.dl?dstr(t.dl):'')+'"></label>'
  +'<label>Prioriteit<input type="number" id="ep" min="1" max="5" value="'+t.prio+'"></label>'
  +'<label style="width:100%">Locatie (leeg = kantoor)<input id="el" list="dl" '+f+' value="'+esc(t.loc||'')+'"></label>'
  +'<label><span>Niet splitsen</span><input type="checkbox" id="ens"'+(t.ns?' checked':'')+'></label></div>'
  +'<div class="mu" id="em" style="margin-top:6px"></div><div style="margin-top:8px"><button class="p" id="es" data-i="'+i+'">Opslaan</button> <button id="ec">Annuleren</button></div>';
 $('ov').hidden=false;}
function saveTask(i){
 const t=tasks[i],name=$('en').value.trim(),h=parseFloat($('ed').value);
 if(!name||!(h>0)){$('em').textContent='Vul een naam en een duur (uren) in.';return}
 if($('esd').value&&$('edl').value&&$('esd').value>$('edl').value){$('em').textContent='De startdatum ligt na de deadline.';return}
 if(tasks.some((u,j)=>j!==i&&u.name.trim().toLowerCase()===name.toLowerCase())){$('em').textContent='Er bestaat al een taak met de naam "'+name+'".';return}
 const L=$('el').value.trim(),cm=L.match(/^(-?\d+\.\d+)\s*[,;]\s*(-?\d+\.\d+)$/);
 const nk0=noteKey({task:true,tid:i});
 Object.assign(t,{name,min:Math.round(h*60),sd:$('esd').value?pdate($('esd').value):null,dl:$('edl').value?pdate($('edl').value):null,prio:parseInt($('ep').value)||3,ns:$('ens').checked});
 const nk1=noteKey({task:true,tid:i});if(nk0!==nk1&&NT[nk0]){NT[nk1]=NT[nk0];delete NT[nk0];svN()}   // notitie volgt de nieuwe naam
 if(L!==(t.loc||'')||!t.geo){t.loc=L;t.geo=cm?[+cm[1],+cm[2]]:null}      // nieuwe locatie wordt opnieuw opgezocht
 shut();if(planned)$('go').onclick();}
document.addEventListener('keydown',e=>{if(e.key==='Escape')shut()});

// ---------- Extra taak toevoegen ----------
$('na').onclick=()=>{
 const name=$('nn').value.trim(),h=parseFloat($('nd').value);
 if(!name||!(h>0)){$('nm').textContent='Vul een naam en een duur (uren) in.';return}
 if($('nsd').value&&$('ndl').value&&$('nsd').value>$('ndl').value){$('nm').textContent='De startdatum ligt na de deadline.';return}
 if(tasks.some(u=>u.name.trim().toLowerCase()===name.toLowerCase())){$('nm').textContent='Er bestaat al een taak met de naam "'+name+'".';return}
 const L=$('nl').value.trim(),cm=L.match(/^(-?\d+\.\d+)\s*[,;]\s*(-?\d+\.\d+)$/);
 tasks.push({name,min:Math.round(h*60),sd:$('nsd').value?pdate($('nsd').value):null,dl:$('ndl').value?pdate($('ndl').value):null,prio:parseInt($('np').value)||3,loc:L,geo:cm?[+cm[1],+cm[2]]:null,ns:$('ns').checked});
 $('nn').value='';$('nl').value='';$('ndl').value='';$('nsd').value='';$('ns').checked=false;
 $('st').textContent=tasks.length+' taken, samen '+Math.round(tasks.reduce((a,t)=>a+t.min,0)/6)/10+' uur.';
 $('nm').textContent='"'+name+'" toegevoegd.'+(planned?' Planning bijgewerkt.':' Druk op "Plan in".');
 if(planned)$('go').onclick();};

function exportICS(){saveFile('planning.ics',Planner.makeICS(plan,doneT),'text/calendar')}
function saveFile(name,text,type){                             // gewone download in de browser
 const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([text],{type}));a.download=name;
 document.body.appendChild(a);a.click();a.remove();}
