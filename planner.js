/* planner.js — BACKEND van de Auto-agenda
   Bevat alle logica: agenda en taken inlezen, adressen opzoeken, reistijden berekenen en de planning maken.
   Raakt de pagina (DOM) NIET aan, dus dit bestand kan los van ui.js gebruikt worden.
   Gebruik:  const res = await Planner.run({...instellingen});  */
const Planner=(()=>{
const f2=n=>String(n).padStart(2,'0');
const dstr=d=>d.getFullYear()+'-'+f2(d.getMonth()+1)+'-'+f2(d.getDate());

// ---------- ICS ----------
function pd(v){const m=v.match(/^(\d{4})(\d\d)(\d\d)T(\d\d)(\d\d)(\d\d)(Z?)$/);if(!m)return null;
 const a=m.slice(1,7).map(Number);
 return m[7]?new Date(Date.UTC(a[0],a[1]-1,a[2],a[3],a[4],a[5])):new Date(a[0],a[1]-1,a[2],a[3],a[4],a[5]);}
function parseICS(txt){
 const L=txt.replace(/\r?\n[ \t]/g,'').split(/\r?\n/),out=[];let e=null;
 for(const l of L){
  if(l==='BEGIN:VEVENT'){e={};continue}
  if(l==='END:VEVENT'){if(e&&e.start){if(!e.end)e.end=new Date(+e.start+36e5);out.push(e)}e=null;continue}
  if(!e)continue;
  const i=l.indexOf(':');if(i<0)continue;
  const k=l.slice(0,i).split(';')[0],v=l.slice(i+1);
  if(k==='DTSTART')e.start=pd(v);          // hele-dag-items (alleen datum) worden genegeerd
  else if(k==='DTEND')e.end=pd(v);
  else if(k==='SUMMARY')e.name=v.replace(/\\,/g,',');
  else if(k==='RRULE')e.rr=v;
  else if(k==='LOCATION')e.loc=v.replace(/\\,/g,',').replace(/\\n/g,', ');
  else if(k==='X-APPLE-STRUCTURED-LOCATION'){const g=l.match(/geo:(-?[\d.]+),(-?[\d.]+)/);if(g)e.geo=[+g[1],+g[2]]}
  else if(k==='EXDATE')(e.ex=e.ex||[]).push(...v.split(',').map(x=>x.slice(0,8)));
 }
 return out;}
function expand(e,from,to){
 const dur=e.end-e.start;
 if(!e.rr)return(e.end>from&&e.start<to)?[{...e,src:e}]:[];
 const r=Object.fromEntries(e.rr.split(';').map(s=>s.split('=')));
 const iv=+(r.INTERVAL||1),cnt=r.COUNT?+r.COUNT:1e9;
 const until=r.UNTIL?pd(r.UNTIL.length===8?r.UNTIL+'T235959':r.UNTIL.replace(/Z?$/,'Z')):null;
 const D={SU:0,MO:1,TU:2,WE:3,TH:4,FR:5,SA:6};
 const bd=r.BYDAY?r.BYDAY.split(',').map(x=>D[x.slice(-2)]):[e.start.getDay()];
 const s0=new Date(e.start.getFullYear(),e.start.getMonth(),e.start.getDate());
 const out=[];let n=0;
 for(let i=0;;i++){
  const d=new Date(s0.getFullYear(),s0.getMonth(),s0.getDate()+i);
  if(d>=to)break;
  let ok=false;
  if(r.FREQ==='DAILY')ok=i%iv===0;
  else if(r.FREQ==='WEEKLY')ok=Math.floor((i+s0.getDay())/7)%iv===0&&bd.includes(d.getDay());
  else if(r.FREQ==='MONTHLY')ok=d.getDate()===s0.getDate()&&((d.getFullYear()-s0.getFullYear())*12+d.getMonth()-s0.getMonth())%iv===0;
  else if(r.FREQ==='YEARLY')ok=d.getDate()===s0.getDate()&&d.getMonth()===s0.getMonth()&&(d.getFullYear()-s0.getFullYear())%iv===0;
  if(!ok)continue;
  const st=new Date(d.getFullYear(),d.getMonth(),d.getDate(),e.start.getHours(),e.start.getMinutes());
  if(until&&st>until)break;
  if(++n>cnt)break;
  const key=dstr(d).replace(/-/g,'');
  if(e.ex&&e.ex.includes(key))continue;
  const en=new Date(+st+dur);
  if(en>from)out.push({...e,start:st,end:en,src:e,ok:key});
 }
 return out;}

// ---------- Taken ----------
function pdate(v){if(!v)return null;if(v instanceof Date)return new Date(v.getFullYear(),v.getMonth(),v.getDate());
 const s=String(v).trim();let m=s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})$/);
 if(m)return new Date(+m[3],m[2]-1,+m[1]);
 const d=new Date(s);return isNaN(d)?null:new Date(d.getFullYear(),d.getMonth(),d.getDate());}
function parseTasks(rows){
 return rows.map(r=>{
  const g=(...ks)=>{for(const k of Object.keys(r)){const kl=k.toLowerCase();if(ks.some(x=>kl.includes(x)))return{k:kl,v:r[k]}}return{}};
  const n=g('taak','task','titel','naam'),d=g('duur','minut','tijd','uur','min'),dl=g('deadline','vervaldatum','tegen'),p=g('prio'),lc=g('locat','plaats','adres'),sp=g('splits','ononderbr'),sc=g('startdatum','start','begin','vanaf');
  let min=parseFloat(String(d.v||'').replace(',','.'));if(!(d.k&&d.k.includes('min')))min*=60;   // standaard uren; staat 'min' in de kolomnaam, dan minuten
  if(!n.v||!(min>0))return null;
  const L=String(lc.v||'').trim(),cm=L.match(/^(-?\d+\.\d+)\s*[,;]\s*(-?\d+\.\d+)$/);
  return{name:String(n.v),min:Math.round(min),dl:pdate(dl.v),prio:parseInt(p.v)||3,loc:L,geo:cm?[+cm[1],+cm[2]]:null,sd:pdate(sc.v),ns:/^(ja|j|yes|y|x|1|true|waar|✓)$/i.test(String(sp.v||'').trim())};
 }).filter(Boolean);}
// ---------- Reistijd ----------
function travel(e,def){
 if(!e.loc&&!e.geo)return 0;
 const loc=(e.loc||'').toLowerCase(),of=OFT;
 if(of&&loc.includes(of))return 0;                      // afspraak op kantoor zelf
 const m=lk(OF,e.geo);return m!=null?m:def;}            // berekend, anders de standaardreistijd
function hop(a,b,def){                                  // rechtstreekse rit van plaats a naar plaats b
 const m=lk(a.geo,b.geo);if(m!=null)return m;
 return Math.min(a.tr+b.tr,def);}                       // anders standaardreistijd, nooit meer dan via kantoor

// ---------- OpenStreetMap: adressen opzoeken en reistijden berekenen ----------
let G={},OF=null,M={},OFT='';   // OF = coördinaten kantoor, M = reistijdmatrix (min), OFT = kantoornaam
try{G=JSON.parse(localStorage.getItem('g2')||'{}')}catch(e){}
const sv=()=>{try{localStorage.setItem('g2',JSON.stringify(G))}catch(e){}};
const key=g=>g[0].toFixed(5)+','+g[1].toFixed(5),ll=g=>[g[1],g[0]],sl=ms=>new Promise(r=>setTimeout(r,ms));
const lk=(a,b)=>a&&b?M[key(a)+'>'+key(b)]:null;
async function geocode(t){
 const k=t.toLowerCase();if(k in G)return G[k];
 for(const c of [t,t.split(', ').slice(1).join(', ')].filter(Boolean)){            // eerst volledig, dan zonder plaatsnaam
  try{const r=await(await fetch('https://nominatim.openstreetmap.org/search?format=json&limit=1&q='+encodeURIComponent(c))).json();
   await sl(1100);                                                                  // Nominatim: max 1 aanvraag per seconde
   if(r[0]){G[k]=[+r[0].lat,+r[0].lon];sv();return G[k]}}catch(e){return undefined}}
 G[k]=null;sv();return null;}
async function route(pts){try{const r=await(await fetch('https://router.project-osrm.org/route/v1/driving/'+pts.map(g=>g[1]+','+g[0]).join(';')+'?overview=full&geometries=geojson')).json();return r.routes&&r.routes[0]}catch(e){return null}}
async function prepare(lastEvs,tasks,o){                  // zoekt adressen op en berekent alle reistijden in één keer
 const st=o.onStatus||(()=>{});M={};OF=null;
 const items=[...lastEvs,...tasks].filter(x=>x.loc&&!x.geo),of=o.office||'',b=o.officeCoords;
 const need=[...new Set([...items.map(x=>x.loc),...(of?[of]:[])])].filter(t=>!(t.toLowerCase() in G));
 let n=0;for(const t of need){st('Locaties opzoeken '+(++n)+'/'+need.length+'…');await geocode(t)}
 items.forEach(x=>{x.geo=G[x.loc.toLowerCase()]||null});
 OF=b&&b.length===2&&!b.some(isNaN)?b:(of&&G[of.toLowerCase()])||null;
 const pts=[],seen=new Set();
 [OF,...lastEvs.map(e=>e.geo),...tasks.map(t=>t.geo)].forEach(g=>{if(g&&!seen.has(key(g))){seen.add(key(g));pts.push(g)}});
 const miss=items.filter(x=>!x.geo).length;
 if(pts.length>1&&pts.length<=90){
  st('Reistijden berekenen…');
  try{const r=await(await fetch('https://router.project-osrm.org/table/v1/driving/'+pts.map(g=>g[1]+','+g[0]).join(';')+'?annotations=duration')).json();
   if(r.durations)pts.forEach((a,i)=>pts.forEach((c,j)=>{const v=r.durations[i][j];if(v!=null)M[key(a)+'>'+key(c)]=Math.ceil(v/60)}))}
  catch(e){return'Routeservice niet bereikbaar: schatting gebruikt.'}}
 return(miss?miss+' locatie(s) niet gevonden (schatting gebruikt). ':'')+(Object.keys(M).length?'Reistijden berekend met OpenStreetMap.':'');}
async function suggest(v){                                  // adresvoorstellen tijdens het typen
 try{const r=await(await fetch('https://nominatim.openstreetmap.org/search?format=json&limit=5&q='+encodeURIComponent(v))).json();
  r.forEach(o=>{G[o.display_name.toLowerCase()]=[+o.lat,+o.lon]});sv();return r.map(o=>o.display_name)}catch(e){return[]}}
async function run(o){                                      // hoofdfunctie: o = alle instellingen, resultaat = de planning
 OFT=(o.office||'').toLowerCase();
 const {events,tasks,doneT}=o,start=o.from,days=o.days,end=new Date(+start+days*864e5+36e5);
 const ws=o.ws,we=o.we,buf=o.defaultTravel,minc=o.minBlock,wk=o.weekend,ls=o.lunchStart,ld=o.lunchMin,bun=o.bundle,rad=o.radius;
 const lastEvs=events.flatMap(e=>expand(e,start,end));
 const status=await prepare(lastEvs,tasks,o);
 const q=tasks.map((t,i)=>{const onsite=!t.loc||(OFT&&t.loc.toLowerCase().includes(OFT));
  return{...t,loc:onsite?null:t.loc,tr:onsite?0:travel(t,buf),left:doneT[i]?0:t.min,tid:i}})
  .sort((a,b)=>(a.dl?+a.dl:9e15)-(b.dl?+b.dl:9e15)||a.prio-b.prio||String(a.loc).localeCompare(String(b.loc)));
 lastEvs.forEach(e=>e.tr=travel(e,buf));
 const plan=[],lunches=[],travels=[];
 for(let i=0;i<days;i++){
  const d=new Date(start.getFullYear(),start.getMonth(),start.getDate()+i);
  if(!wk&&(d.getDay()===0||d.getDay()===6))continue;
  const a=new Date(d);a.setHours(ws[0],ws[1],0,0);
  const b=new Date(d);b.setHours(we[0],we[1],0,0);
  const trip=(x,y)=>!x&&!y?0:!x?y.tr:!y?x.tr:(x.loc&&x.loc.toLowerCase()===y.loc.toLowerCase()||x.geo&&y.geo&&key(x.geo)===key(y.geo)?0:hop(x,y,buf));
  const pt=t=>t.loc?{loc:t.loc,tr:t.tr,geo:t.geo}:null;     // plaats (null = kantoor)
  const fx=lastEvs.filter(e=>+e.start>=+d&&+e.start<+d+864e5).map(e=>({s:+e.start,e:+e.end,pl:e.tr>0?{loc:e.loc||'',tr:e.tr,geo:e.geo}:null}));
  if(ld>0){const l0=new Date(d);l0.setHours(ls[0],ls[1],0,0);const l1=new Date(+l0+ld*6e4);
   lunches.push({name:'🍽 Lunch',start:l0,end:l1,task:false});fx.push({s:+l0,e:+l1,lunch:true})}
  fx.sort((x,y)=>x.s-y.s);
  // reistijd die na de laatste taak van een gat nog moet passen (tot de volgende afspraak of terug naar kantoor)
  const need=(k,pl)=>{const n=fx[k];
   if(!n||n.s>=+b)return trip(pl,null);
   if(!n.lunch)return trip(pl,n.pl);
   const o=fx[k+1],ok=o&&o.s<+b,g2=((ok?o.s:+b)-n.e)/6e4;   // lunch is plaatsneutraal: de rit mag na de lunch gebeuren
   return Math.max(0,trip(pl,ok?o.pl:null)-Math.max(0,g2));};
  let cur=+a,at=null,le=+a;                                       // at = plaats waar je nu bent
  for(let k=0;k<=fx.length;k++){
   const now0=dstr(d)===dstr(new Date())?Math.ceil(Date.now()/3e5)*3e5:0,n=fx[k],gs=Math.max(cur,+a,now0),ge=Math.min(n?n.s:+b,+b);
   let ep=gs;
   if(ge>gs){let p=gs;
    const tryPlace=t=>{
     if(t.left<=0)return false;
     if(t.sd&&+d<+t.sd)return false;                        // nog niet starten
     if(t.dl&&+d>+t.dl)return false;                        // na de deadline: niet meer inplannen
     const L=pt(t),pre=trip(at,L),post=need(k,L);
     const room=Math.floor((ge-p)/6e4)-pre-post;
     if(room<=0||(t.ns?room<t.left:(room<minc&&room<t.left)))return false;   // 'niet splitsen': alles of niets
     const m=Math.min(room,t.left),s=p+pre*6e4;
     if(pre>0)travels.push({name:'🚗 Reis naar '+(L?L.loc.split(',')[0]:'kantoor'),start:new Date(p),end:new Date(p+pre*6e4),travel:true,task:false});
     plan.push({geo:t.geo,fr:at?at.geo:OF,name:t.name,start:new Date(s),end:new Date(s+m*6e4),task:true,loc:t.loc,tr:pre,tid:t.tid});
     p=s+m*6e4;ep=p;le=p;t.left-=m;at=L;return true};
    // bundelen: niet-dringende taken vlakbij de huidige plaats meteen meenemen (deadlines blijven leidend)
    const pull=()=>{if(bun&&at)for(const t of q)if(t.loc&&t.left>0&&!(t.dl&&+t.dl-+d<1.9*864e5)&&trip(at,pt(t))<=rad)tryPlace(t)};
    pull();
    for(const t of q)if(tryPlace(t))pull();}
   if(n&&!n.lunch&&n.pl){const T=trip(at,n.pl);if(T>0)travels.push({name:'🚗 Reis naar '+n.pl.loc.split(',')[0],start:new Date(n.s-T*6e4),end:new Date(n.s),travel:true,task:false})}
   if(!n&&at){const T=trip(at,null);if(T>0)travels.push({name:'🚗 Terug naar kantoor',start:new Date(le),end:new Date(le+T*6e4),travel:true,task:false})}
   if(n){cur=Math.max(cur,n.e);if(!n.lunch){at=n.pl;le=n.e}}
  }
 }

 return{plan,travels,lunches,lastEvs,q,office:OF,status};}

function makeICS(plan,doneT){                                // planning als .ics-tekst
 const z=d=>d.toISOString().replace(/[-:]/g,'').replace(/\.\d+/,'');
 return'BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//Auto-agenda//NL\r\n'+plan.filter(p=>!doneT[p.tid]).map((p,i)=>
  'BEGIN:VEVENT\r\nUID:auto-'+Date.now()+'-'+i+'@auto-agenda\r\nDTSTAMP:'+z(new Date())+'\r\nDTSTART:'+z(p.start)+'\r\nDTEND:'+z(p.end)+'\r\nSUMMARY:'+p.name.replace(/[,;]/g,' ')+(p.loc?'\r\nLOCATION:'+p.loc.replace(/[,;]/g,' '):'')+'\r\nEND:VEVENT\r\n').join('')+'END:VCALENDAR\r\n';}

function uniqueTasks(list){                                  // geen twee taken met dezelfde naam
 const sn=new Set(),out=list.filter(t=>{const k=t.name.trim().toLowerCase();if(sn.has(k))return false;sn.add(k);return true});
 return{list:out,dropped:list.length-out.length};}

return{dstr,key,pdate,parseICS,parseTasks,uniqueTasks,run,makeICS,suggest,route};
})();
