const qr=document.getElementById('qr'),placeholder=document.getElementById('placeholder'),file=document.getElementById('file'),remove=document.getElementById('remove'),label=document.getElementById('uploadLabel'),status=document.getElementById('status');
const DB='badge-chantier-local',STORE='images';
function db(){return new Promise((resolve,reject)=>{const req=indexedDB.open(DB,1);req.onupgradeneeded=()=>req.result.createObjectStore(STORE);req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error)})}
async function read(){const d=await db();return new Promise((resolve,reject)=>{const tx=d.transaction(STORE,'readonly');const r=tx.objectStore(STORE).get('qr');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);tx.oncomplete=()=>d.close()})}
async function write(blob){const d=await db();return new Promise((resolve,reject)=>{const tx=d.transaction(STORE,'readwrite');tx.objectStore(STORE).put(blob,'qr');tx.oncomplete=()=>{d.close();resolve()};tx.onerror=()=>reject(tx.error)})}
async function clear(){const d=await db();return new Promise((resolve,reject)=>{const tx=d.transaction(STORE,'readwrite');tx.objectStore(STORE).delete('qr');tx.oncomplete=()=>{d.close();resolve()};tx.onerror=()=>reject(tx.error)})}
let url;
function display(blob){if(url)URL.revokeObjectURL(url);if(blob){url=URL.createObjectURL(blob);qr.src=url;qr.style.display='block';placeholder.hidden=true;remove.hidden=false;label.textContent='Changer mon QR Code'}else{qr.removeAttribute('src');qr.style.display='none';placeholder.hidden=false;remove.hidden=true;label.textContent='Importer mon QR Code'}}
file.addEventListener('change',async()=>{const f=file.files[0];if(!f)return;if(!f.type.startsWith('image/')){status.textContent='Choisissez une image (photo ou capture d’écran).';return}try{await write(f);display(f);status.textContent='QR Code enregistré sur cet appareil.';await detectLink(f)}catch(e){status.textContent='Enregistrement impossible : vérifiez l’espace disponible.'}file.value=''});
remove.addEventListener('click',async()=>{if(!confirm('Supprimer le QR Code enregistré sur cet appareil ?'))return;try{await clear();display(null);resetDocs();status.textContent='QR Code supprimé.'}catch(e){status.textContent='Suppression impossible.'}});
(async()=>{try{display(await read());const saved=await read();if(saved)await detectLink(saved)}catch(e){status.textContent='Stockage local indisponible dans ce navigateur.'}})();
if('serviceWorker'in navigator && location.protocol.startsWith('http'))navigator.serviceWorker.register('./sw.js').catch(()=>{});



// V4 : QR local hors ligne + identification du service depuis le QR.
const docs=document.getElementById('docs'),openDrive=document.getElementById('openDrive'),decodeStatus=document.getElementById('decodeStatus');
const LINK_KEY='badge-chantier-doc-url';
let currentLink=null;
function parseLink(value){
  try {const u=new URL(value.trim());
    if(u.protocol!=='https:' || u.username || u.password)return null;
    if(!['drive.google.com','docs.google.com'].includes(u.hostname) && !/^[-a-z0-9.]+$/i.test(u.hostname))return null;
    return u.href;
  } catch {return null;}
}

function resetDocs(){currentLink=null;try{localStorage.removeItem(LINK_KEY)}catch{}docs.hidden=true;openDrive.removeAttribute('href');decodeStatus.textContent='Importez votre QR Code pour retrouver votre dossier.';}
function imageDataFromBlob(blob){return new Promise((resolve,reject)=>{const img=new Image(),src=URL.createObjectURL(blob);img.onload=()=>{try{const c=document.createElement('canvas'),max=1800,scale=Math.min(1,max/Math.max(img.naturalWidth,img.naturalHeight));c.width=Math.max(1,Math.round(img.naturalWidth*scale));c.height=Math.max(1,Math.round(img.naturalHeight*scale));const ctx=c.getContext('2d',{willReadFrequently:true});ctx.drawImage(img,0,0,c.width,c.height);resolve(ctx.getImageData(0,0,c.width,c.height))}catch(e){reject(e)}finally{URL.revokeObjectURL(src)}};img.onerror=()=>{URL.revokeObjectURL(src);reject(new Error('Image illisible'))};img.src=src})}
async function decodeQR(blob){
 const data=await imageDataFromBlob(blob);
 if(typeof jsQR==='function'){
  for(const inversionAttempts of ['attemptBoth','invertFirst']){const result=jsQR(data.data,data.width,data.height,{inversionAttempts});if(result?.data)return result.data;}
 }
 if('BarcodeDetector' in window){try{const detector=new BarcodeDetector({formats:['qr_code']});const c=document.createElement('canvas');c.width=data.width;c.height=data.height;c.getContext('2d').putImageData(data,0,0);const found=await detector.detect(c);if(found.length)return found[0].rawValue;}catch(e){console.warn('Lecteur QR natif indisponible',e)}}
 return null;
}
async function showDocs(link){currentLink=link;docs.hidden=false;openDrive.href=link;decodeStatus.textContent='Lien du QR Code reconnu. Touchez le bouton pour consulter vos documents.';}
async function detectLink(blob){
 decodeStatus.textContent='Lecture automatique du QR Code…';
 try{const content=await decodeQR(blob),link=content?parseLink(content):null;
 if(!link){let saved=null;try{saved=parseLink(localStorage.getItem(LINK_KEY)||'')}catch{} if(saved){await showDocs(saved);decodeStatus.textContent='Lien enregistré retrouvé. Vous pouvez ouvrir vos documents.';return;}docs.hidden=true;decodeStatus.textContent=content?'Ce QR Code ne contient pas de lien Web HTTPS reconnu.':'Lecture du QR Code indisponible. Vérifiez votre connexion puis réimportez votre image.';return;}
 try{localStorage.setItem(LINK_KEY,link)}catch{}
 await showDocs(link);
 }catch(e){let saved=null;try{saved=parseLink(localStorage.getItem(LINK_KEY)||'')}catch{}if(saved){await showDocs(saved);decodeStatus.textContent='Lien enregistré retrouvé. Vous pouvez ouvrir vos documents.';}else{docs.hidden=true;decodeStatus.textContent='Lecture automatique indisponible. Connectez-vous à Internet puis réimportez le QR Code.';}}
}
