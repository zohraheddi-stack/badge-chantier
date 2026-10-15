"use strict";
const $=id=>document.getElementById(id);
const qr=$('qr'),placeholder=$('placeholder'),file=$('file'),status=$('status');
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
function imageFromBlob(blob){return new Promise((resolve,reject)=>{const img=new Image(),url=URL.createObjectURL(blob);img.onload=()=>{URL.revokeObjectURL(url);resolve(img)};img.onerror=()=>{URL.revokeObjectURL(url);reject(new Error('Image illisible. Essayez une capture d’écran PNG ou JPG du QR Code.'))};img.src=url})}
function canvasFromImage(img,max=1400){const w=img.naturalWidth,h=img.naturalHeight;if(!w||!h)throw new Error('Image vide');const scale=Math.min(1,max/Math.max(w,h));const c=document.createElement('canvas');c.width=Math.max(1,Math.round(w*scale));c.height=Math.max(1,Math.round(h*scale));c.getContext('2d',{willReadFrequently:true}).drawImage(img,0,0,c.width,c.height);return c}
function cropCanvas(source,fraction){const size=Math.floor(Math.min(source.width,source.height)*fraction);const c=document.createElement('canvas');c.width=c.height=size; c.getContext('2d',{willReadFrequently:true}).drawImage(source,Math.floor((source.width-size)/2),Math.floor((source.height-size)/2),size,size,0,0,size,size);return c}
function resizedCanvas(source,max){const scale=Math.min(1,max/Math.max(source.width,source.height));const c=document.createElement('canvas');c.width=Math.max(1,Math.round(source.width*scale));c.height=Math.max(1,Math.round(source.height*scale));c.getContext('2d',{willReadFrequently:true}).drawImage(source,0,0,c.width,c.height);return c}
function rotatedCanvas(source){const c=document.createElement('canvas');c.width=source.height;c.height=source.width;const ctx=c.getContext('2d',{willReadFrequently:true});ctx.translate(c.width,0);ctx.rotate(Math.PI/2);ctx.drawImage(source,0,0);return c}
function jsDecode(canvas,options={}){
 if(typeof jsQR!=='function')throw new Error('Lecteur QR indisponible. Rechargez la page.');
 const ctx=canvas.getContext('2d',{willReadFrequently:true});const im=ctx.getImageData(0,0,canvas.width,canvas.height);
 const result=jsQR(im.data,im.width,im.height,{inversionAttempts:options.invert?'attemptBoth':'dontInvert'});
 return result?.data||null;
}
// Rend la main à Safari entre les tentatives pour éviter une interface figée.
const yieldFrame=()=>new Promise(resolve=>setTimeout(resolve,0));
async function decodeCanvas(canvas,options={}){
 const attempts=options.video?[
  [canvas,false],
  [resizedCanvas(cropCanvas(canvas,.72),640),false],
  [resizedCanvas(canvas,640),true]
 ]:[
  [canvas,true],
  [resizedCanvas(canvas,900),true],
  [resizedCanvas(cropCanvas(canvas,.8),850),true],
  [resizedCanvas(cropCanvas(canvas,.55),650),true],
  [rotatedCanvas(resizedCanvas(canvas,900)),true]
 ];
 for(const [c,invert] of attempts){
  if(options.cancelled?.())return null;
  await yieldFrame();
  try{const raw=jsDecode(c,{invert});if(raw)return raw}
  catch(e){console.warn('Tentative de lecture QR échouée',e);if(typeof jsQR!=='function')throw e}
 }
 return null;
}
async function decode(blob){
 const img=await imageFromBlob(blob);
 // Différentes tailles pour les photos iPhone/Android, sans dépasser la mémoire mobile.
 for(const max of [1400,950]){
  const raw=await decodeCanvas(canvasFromImage(img,max));if(raw)return raw;
 }
 return null;
}
// Regénère un QR net depuis le lien décodé, au lieu de sauvegarder une photo.
async function cleanQRCode(link){
 if(typeof BadgeQRCode!=='function')throw new Error('Générateur de QR Code indisponible.');
 const encoder=new BadgeQRCode(0,BadgeQRErrorLevel.M);
 encoder.addData(link);encoder.make();
 const count=encoder.getModuleCount(),quiet=4,unit=Math.max(5,Math.floor(1024/(count+quiet*2)));
 const canvas=document.createElement('canvas');canvas.width=canvas.height=(count+quiet*2)*unit;
 const ctx=canvas.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);
 ctx.fillStyle='#000';for(let y=0;y<count;y++)for(let x=0;x<count;x++)if(encoder.isDark(y,x))ctx.fillRect((x+quiet)*unit,(y+quiet)*unit,unit,unit);
 const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));
 if(!blob)throw new Error('Impossible de créer le QR Code.');return blob;
}
async function importQR(input){const blob=input.files?.[0];if(!blob||busy)return;busy=true;status.textContent='Lecture du QR Code…';status.className='';try{if(!blob.type.startsWith('image/')&&!/\.(heic|heif|jpg|jpeg|png|webp)$/i.test(blob.name||''))throw new Error('Choisissez une image.');const raw=await Promise.race([decode(blob),new Promise((_,reject)=>setTimeout(()=>reject(new Error('Lecture trop longue. Essayez une capture d’écran du QR Code.')),18000))]);const link=raw?parseLink(raw):null;if(!link){status.textContent=raw?'Ce QR Code ne contient pas de lien HTTPS valide.':'QR Code non reconnu. Essayez une capture d’écran nette, bien cadrée et éclairée.';return}
const clean=await cleanQRCode(link);await saveQR(clean);try{localStorage.setItem(LINK_KEY,link)}catch{}
display(clean);showLink(link);status.textContent='QR Code enregistré automatiquement.';status.className='success'
}catch(e){status.textContent=e.message||'Une erreur est survenue.';status.className=''}finally{input.value='';busy=false}}
file.addEventListener('change',()=>importQR(file));

const scanner=$('scanner'),video=$('video'),scanMessage=$('scanMessage'),scanButton=$('scanButton');
let stream=null,scanActive=false,scanTimer=null,scanStarted=0,scanAttempts=0,scanBusy=false;
function stopScanner(){
 scanActive=false;
 if(scanTimer!==null){clearTimeout(scanTimer);scanTimer=null}
 if(stream){for(const track of stream.getTracks())track.stop();stream=null}
 video.pause();video.srcObject=null;scanner.hidden=true;scanButton.disabled=false;scanBusy=false;
}
function videoCanvas(crop=false){
 const w=video.videoWidth,h=video.videoHeight;if(!w||!h)return null;
 // Résolution plafonnée pour limiter la mémoire et le temps de traitement sur iPhone.
 const side=crop?Math.min(w,h)*0.75:Math.max(w,h);
 const scale=Math.min(1,(crop?720:960)/side);
 const c=document.createElement('canvas');const ctx=c.getContext('2d',{willReadFrequently:true});
 if(crop){const size=Math.round(Math.min(w,h)*0.75);c.width=c.height=Math.max(1,Math.round(size*scale));ctx.drawImage(video,Math.floor((w-size)/2),Math.floor((h-size)/2),size,size,0,0,c.width,c.height)}
 else{c.width=Math.max(1,Math.round(w*scale));c.height=Math.max(1,Math.round(h*scale));ctx.drawImage(video,0,0,c.width,c.height)}
 return c;
}
async function scanTick(){
 if(!scanActive||scanBusy)return;
 scanBusy=true;
 try{
  if(video.readyState>=2&&video.videoWidth){
   // Alterne image entière et cadrage central pour les capteurs iPhone/Android.
   const c=videoCanvas(scanAttempts%4===3);
   const raw=c?await decodeCanvas(c,{video:true,cancelled:()=>!scanActive}):null;
   if(!scanActive)return;
   if(raw){
    const link=parseLink(raw);
    if(link){scanMessage.textContent='QR Code reconnu. Enregistrement…';scanActive=false;
     const blob=await cleanQRCode(link);await saveQR(blob);try{localStorage.setItem(LINK_KEY,link)}catch{}
     stopScanner();display(blob);showLink(link);status.textContent='QR Code scanné et enregistré automatiquement.';status.className='success';return;
    }
    scanMessage.textContent='QR Code détecté, mais il ne contient pas de lien HTTPS valide.';
   }
   scanAttempts++;
  }
  if(Date.now()-scanStarted>12000&&scanAttempts%6===0){scanMessage.textContent='Toujours en recherche… Éloignez légèrement le téléphone pour faire la mise au point. Le scan continue. Vous pouvez aussi charger une photo.'}
 }catch(e){scanMessage.textContent='Erreur de lecture : '+(e.message||'réessayez')}
 finally{scanBusy=false;if(scanActive)scanTimer=setTimeout(scanTick,230)}
}
scanButton.addEventListener('click',async()=>{
 if(scanActive)return;
 if(typeof jsQR!=='function'){status.textContent='Le lecteur QR n’est pas disponible. Rechargez la page en étant connecté à Internet une première fois.';return}
 if(!navigator.mediaDevices?.getUserMedia){status.textContent='Caméra indisponible. Ouvrez Badge Chantier dans Safari ou Chrome, ou utilisez « Charger un QR Code ».';return}
 scanButton.disabled=true;scanner.hidden=false;scanMessage.textContent='Autorisez la caméra si demandé.';
 try{
  try{stream=await navigator.mediaDevices.getUserMedia({audio:false,video:{facingMode:{ideal:'environment'},width:{ideal:1280},height:{ideal:720}}})}
  catch(e){if(e.name==='NotAllowedError'||e.name==='NotFoundError')throw e;stream=await navigator.mediaDevices.getUserMedia({audio:false,video:{facingMode:'environment'}})}
  video.srcObject=stream;await video.play();
  scanMessage.textContent='Cadrez le QR Code. Reconnaissance automatique…';
  scanAttempts=0;scanStarted=Date.now();scanActive=true;scanTick();
 }catch(e){stopScanner();status.textContent=e.name==='NotAllowedError'?'Accès à la caméra refusé. Autorisez la caméra dans Safari ou Chrome.':'Impossible d’ouvrir la caméra. Utilisez « Charger un QR Code ».'}
});
$('stopScan').addEventListener('click',()=>{stopScanner();status.textContent='Scan annulé.'});
document.addEventListener('visibilitychange',()=>{if(document.hidden)stopScanner()});
window.addEventListener('pagehide',stopScanner);

$('change').addEventListener('click',()=>{choices.hidden=false;management.hidden=true;status.textContent='Chargez une autre image ou scannez un autre QR Code.'});
$('remove').addEventListener('click',async()=>{if(!confirm('Supprimer le QR Code et son lien de cet appareil ?'))return;try{await deleteQR();try{localStorage.removeItem(LINK_KEY)}catch{}display(null);hideLink();status.textContent='QR Code supprimé.';status.className=''}catch{status.textContent='Suppression impossible.'}});
(async()=>{try{const saved=await loadQR();if(!saved)return;display(saved);let link=null;try{link=parseLink(localStorage.getItem(LINK_KEY)||'')}catch{}
if(!link){status.textContent='Lecture du QR Code enregistré…';const raw=await decode(saved);link=raw?parseLink(raw):null;if(link){try{localStorage.setItem(LINK_KEY,link)}catch{}}}
if(link){try{const clean=await cleanQRCode(link);await saveQR(clean);display(clean)}catch(e){console.warn('Ancien QR conservé',e)}showLink(link);status.textContent='QR Code enregistré sur cet appareil.'}else{hideLink();status.textContent='QR Code affiché, mais lien non reconnu. Choisissez « Changer mon QR Code » pour réessayer.'}
}catch{status.textContent='Impossible de charger le QR Code enregistré.'}})();
if('serviceWorker'in navigator&&location.protocol.startsWith('http'))navigator.serviceWorker.register('./sw.js').catch(()=>{});
