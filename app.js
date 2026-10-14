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


// Lecture du QR Code directement sur le téléphone. Aucun lien à saisir.
const docs=document.getElementById('docs'),frame=document.getElementById('driveFrame'),openDrive=document.getElementById('openDrive'),decodeStatus=document.getElementById('decodeStatus');
const LINK_KEY='badge-chantier-drive-link';
function validDriveLink(value){try{const u=new URL(value.trim());return u.protocol==='https:' && (u.hostname==='drive.google.com'||u.hostname==='docs.google.com') ? u.href : null}catch{return null}}
function resetDocs(){try{localStorage.removeItem(LINK_KEY)}catch{}docs.hidden=true;frame.removeAttribute('src');openDrive.removeAttribute('href');decodeStatus.textContent='';}
function showDocs(value){const link=validDriveLink(value);if(!link){docs.hidden=true;return false}docs.hidden=false;openDrive.href=link;const match=new URL(link).pathname.match(/\/folders\/([^/?#]+)/);frame.src=match?'https://drive.google.com/embeddedfolderview?id='+encodeURIComponent(match[1])+'#list':link;return true}
function imageDataFromBlob(blob){return new Promise((resolve,reject)=>{const img=new Image();const src=URL.createObjectURL(blob);img.onload=()=>{try{const c=document.createElement('canvas');const max=1800;const scale=Math.min(1,max/Math.max(img.naturalWidth,img.naturalHeight));c.width=Math.max(1,Math.round(img.naturalWidth*scale));c.height=Math.max(1,Math.round(img.naturalHeight*scale));const ctx=c.getContext('2d',{willReadFrequently:true});ctx.drawImage(img,0,0,c.width,c.height);resolve(ctx.getImageData(0,0,c.width,c.height))}catch(e){reject(e)}finally{URL.revokeObjectURL(src)}};img.onerror=()=>{URL.revokeObjectURL(src);reject(new Error('Image illisible'))};img.src=src})}
async function decodeQR(blob){
  // jsQR fonctionne sur iOS et Android, y compris si BarcodeDetector n'existe pas.
  const data=await imageDataFromBlob(blob);
  if(typeof jsQR==='function'){
    for(const inversionAttempts of ['attemptBoth','invertFirst']){
      const result=jsQR(data.data,data.width,data.height,{inversionAttempts});
      if(result?.data)return result.data;
    }
  }
  if('BarcodeDetector' in window){
    const detector=new BarcodeDetector({formats:['qr_code']});
    const c=document.createElement('canvas');c.width=data.width;c.height=data.height;c.getContext('2d').putImageData(data,0,0);
    const found=await detector.detect(c);if(found.length)return found[0].rawValue;
  }
  return null;
}
async function detectLink(blob){
  decodeStatus.textContent='Lecture de votre QR Code…';
  try{
    const content=await decodeQR(blob);
    const link=content?validDriveLink(content):null;
    if(!link){resetDocs();decodeStatus.textContent=content?'Ce QR Code ne contient pas de lien Google Drive.':'QR Code non reconnu. Vérifiez la netteté de l’image et votre connexion Internet, puis réessayez.';return}
    try{localStorage.setItem(LINK_KEY,link)}catch{}
    showDocs(link);decodeStatus.textContent='Votre dossier a été retrouvé automatiquement.';
  }catch(e){decodeStatus.textContent='Lecture impossible. Vérifiez votre connexion Internet et réessayez.'}
}
document.getElementById('decode').addEventListener('click',async()=>{const blob=await read();if(!blob){decodeStatus.textContent='Importez d’abord votre QR Code.';return}await detectLink(blob)});
