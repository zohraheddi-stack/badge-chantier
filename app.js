"use strict";
const $=id=>document.getElementById(id);
const qr=$('qr'),placeholder=$('placeholder'),file=$('file'),camera=$('camera'),status=$('status');
const choices=$('choices'),management=$('management'),documents=$('documents'),openDrive=$('openDrive'),decodeStatus=$('decodeStatus');
const DB='badge-chantier-local',STORE='images',LINK_KEY='badge-chantier-doc-url';
let previewUrl=null,busy=false;
function database(){return new Promise((resolve,reject)=>{const r=indexedDB.open(DB,1);r.onupgradeneeded=()=>{if(!r.result.objectStoreNames.contains(STORE))r.result.createObjectStore(STORE)};r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)})}
async function dbAction(mode,action){const d=await database();return new Promise((resolve,reject)=>{const tx=d.transaction(STORE,mode);const req=action(tx.objectStore(STORE));let result;req.onsuccess=()=>{result=req.result};tx.oncomplete=()=>{d.close();resolve(result)};tx.onerror=()=>{d.close();reject(tx.error)};tx.onabort=()=>{d.close();reject(tx.error)}})}
const loadQR=()=>dbAction('readonly',s=>s.get('qr'));
const saveQR=blob=>dbAction('readwrite',s=>s.put(blob,'qr'));
const deleteQR=()=>dbAction('readwrite',s=>s.delete('qr'));
function parseLink(value){try{const u=new URL(String(value).trim());return u.protocol==='https:'&&!u.username&&!u.password?u.href:null}catch{return null}}
function display(blob){if(previewUrl)URL.revokeObjectURL(previewUrl);previewUrl=null;if(blob){previewUrl=URL.createObjectURL(blob);qr.src=previewUrl;qr.style.display='block';placeholder.hidden=true;choices.hidden=true;management.hidden=false}else{qr.removeAttribute('src');qr.style.display='none';placeholder.hidden=false;choices.hidden=false;management.hidden=true}}
function showLink(link){documents.hidden=false;openDrive.href=link;decodeStatus.textContent='QR Code reconnu. Vos documents sont accessibles.'}
function hideLink(){documents.hidden=true;openDrive.removeAttribute('href')}
function pixels(blob){return new Promise((resolve,reject)=>{const image=new Image(),url=URL.createObjectURL(blob);image.onload=()=>{try{const max=2200,scale=Math.min(1,max/Math.max(image.naturalWidth,image.naturalHeight));const c=document.createElement('canvas');c.width=Math.max(1,Math.round(image.naturalWidth*scale));c.height=Math.max(1,Math.round(image.naturalHeight*scale));const ctx=c.getContext('2d',{willReadFrequently:true});ctx.drawImage(image,0,0,c.width,c.height);resolve({data:ctx.getImageData(0,0,c.width,c.height),canvas:c})}catch(e){reject(e)}finally{URL.revokeObjectURL(url)}};image.onerror=()=>{URL.revokeObjectURL(url);reject(new Error('Image illisible'))};image.src=url})}
async function decode(blob){const {data,canvas}=await pixels(blob);if('BarcodeDetector'in window){try{const detector=new BarcodeDetector({formats:['qr_code']});const codes=await detector.detect(canvas);if(codes.length&&codes[0].rawValue)return codes[0].rawValue}catch(e){console.info('Lecteur natif non disponible',e)}}
if(typeof jsQR==='function'){for(const mode of ['attemptBoth','invertFirst']){try{const r=jsQR(data.data,data.width,data.height,{inversionAttempts:mode});if(r?.data)return r.data}catch(e){console.info('Lecteur de secours',e)}}}
return null}
async function importQR(input){const blob=input.files?.[0];if(!blob||busy)return;busy=true;status.textContent='Lecture du QR Code…';try{if(!blob.type.startsWith('image/'))throw new Error('Choisissez une image.');const raw=await decode(blob);const link=raw?parseLink(raw):null;if(!link){status.textContent=raw?'Ce QR Code ne contient pas de lien HTTPS valide.':'QR Code non reconnu. Reprenez une photo nette avec le code entier.';return}
await saveQR(blob);try{localStorage.setItem(LINK_KEY,link)}catch{}
display(blob);showLink(link);status.textContent='QR Code enregistré automatiquement.';status.className='success'
}catch(e){status.textContent=e.message||'Une erreur est survenue.';status.className=''}finally{input.value='';busy=false}}
file.addEventListener('change',()=>importQR(file));camera.addEventListener('change',()=>importQR(camera));
$('change').addEventListener('click',()=>{choices.hidden=false;management.hidden=true;status.textContent='Choisissez une autre image ou prenez une nouvelle photo.'});
$('remove').addEventListener('click',async()=>{if(!confirm('Supprimer le QR Code et son lien de cet appareil ?'))return;try{await deleteQR();try{localStorage.removeItem(LINK_KEY)}catch{}display(null);hideLink();status.textContent='QR Code supprimé.';status.className=''}catch{status.textContent='Suppression impossible.'}});
(async()=>{try{const saved=await loadQR();if(!saved)return;display(saved);let link=null;try{link=parseLink(localStorage.getItem(LINK_KEY)||'')}catch{}
if(!link){status.textContent='Lecture du QR Code enregistré…';const raw=await decode(saved);link=raw?parseLink(raw):null;if(link){try{localStorage.setItem(LINK_KEY,link)}catch{}}}
if(link){showLink(link);status.textContent='QR Code enregistré sur cet appareil.'}else{hideLink();status.textContent='QR Code affiché, mais lien non reconnu. Choisissez « Changer mon QR Code » pour réessayer.'}
}catch{status.textContent='Impossible de charger le QR Code enregistré.'}})();
if('serviceWorker'in navigator&&location.protocol.startsWith('http'))navigator.serviceWorker.register('./sw.js').catch(()=>{});
