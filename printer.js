// ========================
//  MOCK VERİ ve YARDIMCILAR
// ========================
const MOCK_DATA = [
  { name: "Ayşe Yılmaz",  title: "Yarışmacı", qr_payload: "ATT-1001" },
  { name: "Mehmet Demir", title: "T3 Vakfı", qr_payload: "ATT-1002" },
  { name: "Elif Kaya",    title: "Konuk",     qr_payload: "ATT-1003" },
  { name: "Ahmet Şen",    title: "Ziyaretçi", qr_payload: "ATT-1004" },
  { name: "Cemre Ak",     title: "Ziyaretçi", qr_payload: "ATT-1005" },
  { name: "Deniz Aslan",  title: "Konuk",     qr_payload: "ATT-1006" },
  { name: "Zeynep Ulu",   title: "Görevli",   qr_payload: "ATT-1007" },
];

let DATA_ROWS = []; // aktif veri kümesi
let SELECTED_PRINTER = null;
let STOP_FLAG = false;

function log(msg, cls=""){
  const el = document.getElementById('log');
  const d = document.createElement('div');
  if(cls) d.className = cls;
  d.textContent = msg;
  el.appendChild(d); el.scrollTop = el.scrollHeight;
}
function setStatus(t){ document.getElementById('status').textContent = t; }
function sleep(ms){ return new Promise(r => setTimeout(r, ms)); }

function csvParse(text){
  const lines = text.split(/\r?\n/).filter(l => l.trim().length);
  if(lines.length < 2) return {header:[], data:[]};
  const header = lines[0].split(',').map(s=>s.trim());
  const data = lines.slice(1).map(line => {
    const cols = line.split(',').map(s=>s.trim());
    const o = {}; header.forEach((h,i)=>o[h]=cols[i]??""); return o;
  });
  return {header, data};
}

function fillZPL(tpl, rec){
  return tpl.replace(/\$\{(\w+)\}/g, (_,k)=> rec[k] ?? "");
}

function renderPreview(rows){
  const preview = document.getElementById('preview');
  if(!rows || !rows.length){ preview.innerHTML = '<p class="muted">Önizleme yok.</p>'; return; }
  const first = rows.slice(0,5);
  const cols = Object.keys(first[0]);
  let html = '<table><thead><tr>' + cols.map(c=>`<th>${c}</th>`).join('') + '</tr></thead><tbody>';
  html += first.map(r=> '<tr>' + cols.map(c=>`<td>${(r[c]??'')}</td>`).join('') + '</tr>').join('');
  html += '</tbody></table>';
  preview.innerHTML = html;
}

// ========================
//  TASARIM ALANI
// ========================
const SCALE = 2;
const designArea = document.getElementById('designArea');
if(designArea){
  const defaults = { name:{x:20,y:20}, title:{x:20,y:70}, qr_payload:{x:20,y:120} };
  Object.keys(defaults).forEach(k=>{
    const el = designArea.querySelector(`.drag[data-field="${k}"]`);
    const p = defaults[k];
    el.style.left = (p.x / SCALE) + 'px';
    el.style.top  = (p.y / SCALE) + 'px';
    makeDraggable(el);
  });
  updateZplFromDesign();
}

function makeDraggable(el){
  el.addEventListener('mousedown', e=>{
    e.preventDefault();
    const rect = designArea.getBoundingClientRect();
    const shiftX = e.clientX - el.offsetLeft;
    const shiftY = e.clientY - el.offsetTop;
    function onMove(ev){
      let x = ev.clientX - rect.left - shiftX;
      let y = ev.clientY - rect.top - shiftY;
      x = Math.max(0, Math.min(x, designArea.clientWidth - el.offsetWidth));
      y = Math.max(0, Math.min(y, designArea.clientHeight - el.offsetHeight));
      el.style.left = x + 'px';
      el.style.top  = y + 'px';
    }
    function onUp(){
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      updateZplFromDesign();
    }
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  });
}

function updateZplFromDesign(){
  if(!designArea) return;
  const getPos = field=>{
    const el = designArea.querySelector(`.drag[data-field="${field}"]`);
    return { x: Math.round((parseInt(el.style.left)||0)*SCALE),
             y: Math.round((parseInt(el.style.top)||0)*SCALE) };
  };
  const namePos = getPos('name');
  const titlePos = getPos('title');
  const qrPos   = getPos('qr_payload');
  const zpl = `^XA
^PW800
^CI28
^LH0,0
^A0N,40,40
^FO${namePos.x},${namePos.y}^FD\${name}^FS
^A0N,28,28
^FO${titlePos.x},${titlePos.y}^FD\${title}^FS
^FO${qrPos.x},${qrPos.y}^BQ,2,10
^FDQA,\${qr_payload}^FS
^XZ`;
  document.getElementById('zpl').value = zpl;
}

// ========================
//  KAYNAK SEÇİMİ UI
// ========================
const sourceRadios = document.querySelectorAll('input[name="source"]');
sourceRadios.forEach(r=> r.addEventListener('change', ()=>{
  const v = document.querySelector('input[name="source"]:checked').value;
  document.getElementById('apiRow').style.display = (v==='api')? 'flex':'none';
  document.getElementById('csvRow').style.display = (v==='csv')? 'flex':'none';
}));

document.getElementById('btnLoadMock').addEventListener('click', ()=>{
  DATA_ROWS = [...MOCK_DATA];
  renderPreview(DATA_ROWS);
  log(`Mock veri yüklendi: ${DATA_ROWS.length} satır`, 'ok');
});

document.getElementById('btnFetch').addEventListener('click', async()=>{
  const url = document.getElementById('apiUrl').value.trim();
  if(!url){ alert('API URL girin.'); return; }
  try{
    const res = await fetch(url);
    if(!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if(!Array.isArray(data)) throw new Error('JSON dizi bekleniyordu.');
    DATA_ROWS = data;
    renderPreview(DATA_ROWS);
    log(`API verisi alındı: ${DATA_ROWS.length} satır`, 'ok');
  }catch(e){ log('API hatası: '+e.message, 'err'); }
});

// CSV yükleme
const csvFile = document.getElementById('csvFile');
csvFile.addEventListener('change', async (e)=>{
  const f = e.target.files?.[0]; if(!f) return;
  const text = await f.text();
  const {header, data} = csvParse(text);
  if(header.length===0){ alert('CSV başlık satırı bulunamadı. (name,title,qr_payload)'); return; }
  DATA_ROWS = data;
  renderPreview(DATA_ROWS);
  log(`CSV yüklendi: ${DATA_ROWS.length} satır`, 'ok');
});

document.getElementById('btnPreview').addEventListener('click', ()=>{
  if(!DATA_ROWS.length){ alert('Önce veri yükleyin.'); return; }
  renderPreview(DATA_ROWS);
  log('İlk 5 satır önizleme gösterildi.');
});

// ========================
//  BROWSER PRINT: YAZICI
// ========================
const printersSel = document.getElementById('printers');

document.getElementById('btnFind').addEventListener('click', ()=>{
  if(!window.BrowserPrint || !BrowserPrint.getLocalDevices){
    alert('BrowserPrint JS yüklenemedi. Agent kurulu mu?');
    return;
  }
  BrowserPrint.getLocalDevices((devices)=>{
    const printers = devices.filter(d=> d.deviceType === 'printer');
    printersSel.innerHTML='';
    printers.forEach(p=>{
      const opt = document.createElement('option');
      opt.value = p.uid || p.name; opt.textContent = p.name || p.uid || 'Yazıcı';
      opt.dataset.raw = JSON.stringify(p); printersSel.appendChild(opt);
    });
    if(printers.length){
      SELECTED_PRINTER = printers[0];
      log(`Bulunan yazıcı: ${SELECTED_PRINTER.name || SELECTED_PRINTER.uid}`, 'ok');
    }else{
      log('Yazıcı bulunamadı. Agent açık mı? USB bağlı mı?', 'err');
    }
  }, (err)=>{ log('Yazıcı arama hatası: '+err, 'err'); }, 'printer');
});

printersSel.addEventListener('change', (e)=>{
  const opt = e.target.selectedOptions[0];
  if(opt?.dataset.raw){ SELECTED_PRINTER = JSON.parse(opt.dataset.raw); log(`Seçilen yazıcı: ${SELECTED_PRINTER.name || SELECTED_PRINTER.uid}`, 'ok'); }
});

document.getElementById('btnTest').addEventListener('click', ()=>{
  if(!SELECTED_PRINTER){ alert('Önce yazıcı seç'); return; }
  const zpl = '^XA^CI28^FO50,50^A0N,40,40^FDTest Baskı^FS^XZ';
  SELECTED_PRINTER.send(zpl, ()=> log('Test baskı gönderildi.','ok'), (e)=> log('Test hata: '+e,'err'));
});

// ========================
//  TOPLU BASKI
// ========================
const btnPrint = document.getElementById('btnPrint');
const btnStop  = document.getElementById('btnStop');
const progEl   = document.getElementById('prog');

btnStop.addEventListener('click', ()=>{ STOP_FLAG = true; log('Durdurma istendi.','warn'); });

btnPrint.addEventListener('click', async()=>{
  if(!SELECTED_PRINTER){ alert('Önce yazıcı seç'); return; }
  if(!DATA_ROWS.length){ alert('Önce veri yükle'); return; }

  STOP_FLAG = false;
  const tpl = document.getElementById('zpl').value;
  const delay = parseInt(document.getElementById('delayMs').value||'100',10);
  let ok=0, fail=0;
  progEl.value = 0; progEl.max = DATA_ROWS.length;
  setStatus(`Baskı başladı (${DATA_ROWS.length} adet)`);

  for(let i=0;i<DATA_ROWS.length;i++){
    if(STOP_FLAG){ setStatus(`Durduruldu. Başarılı: ${ok}, Hata: ${fail}`); break; }
    const rec = DATA_ROWS[i];
    const zpl = fillZPL(tpl, rec);
    await new Promise(resolve => {
      SELECTED_PRINTER.send(zpl, ()=>{ ok++; log(`OK ${i+1}/${DATA_ROWS.length} → ${rec.name||''}`,'ok'); resolve(); }, (e)=>{ fail++; log(`HATA ${i+1}/${DATA_ROWS.length} → ${e}`,'err'); resolve(); });
    });
    progEl.value = i+1;
    await sleep(delay);
  }
  if(!STOP_FLAG) setStatus(`Bitti. Başarılı: ${ok}, Hata: ${fail}`);
});