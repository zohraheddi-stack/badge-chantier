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
function imageFromBlob(blob){return new Promise((resolve,reject)=>{const img=new Image(),url=URL.createObjectURL(blob);img.onload=()=>{URL.revokeObjectURL(url);resolve(img)};img.onerror=()=>{URL.revokeObjectURL(url);reject(new Error('Image illisible sur cet appareil. Essayez une capture d’écran du QR Code.'))};img.src=url})}
function canvasFromImage(img,max=2200){const w=img.naturalWidth,h=img.naturalHeight;if(!w||!h)throw new Error('Image vide');const scale=Math.min(1,max/Math.max(w,h));const c=document.createElement('canvas');c.width=Math.max(1,Math.round(w*scale));c.height=Math.max(1,Math.round(h*scale));c.getContext('2d',{willReadFrequently:true}).drawImage(img,0,0,c.width,c.height);return c}
function enhancedCanvas(source,kind){const c=document.createElement('canvas');c.width=source.width;c.height=source.height;const ctx=c.getContext('2d',{willReadFrequently:true});ctx.drawImage(source,0,0);if(kind==='contrast'||kind==='gray'){const im=ctx.getImageData(0,0,c.width,c.height),d=im.data;for(let i=0;i<d.length;i+=4){const gray=Math.round(d[i]*.299+d[i+1]*.587+d[i+2]*.114);const v=kind==='contrast'?(gray>135?255:0):gray;d[i]=d[i+1]=d[i+2]=v}ctx.putImageData(im,0,0)}return c}
let detector=null;
function getDetector(){if(detector)return detector;if(typeof BarcodeDetector==='undefined')return null;try{detector=new BarcodeDetector({formats:['qr_code']});return detector}catch{return null}}
async function decodeCanvas(canvas,videoMode=false){
 const native=getDetector();
 if(native){try{const codes=await native.detect(canvas);if(codes[0]?.rawValue)return codes[0].rawValue}catch(e){console.info('Détection native indisponible',e)}}
 if(typeof jsQR!=='function')return null;
 const variants=videoMode?['normal','contrast']:['normal','gray','contrast'];
 for(const variant of variants){try{const c=variant==='normal'?canvas:enhancedCanvas(canvas,variant),ctx=c.getContext('2d',{willReadFrequently:true}),data=ctx.getImageData(0,0,c.width,c.height);const result=jsQR(data.data,data.width,data.height,{inversionAttempts:'attemptBoth'});if(result?.data)return result.data}catch(e){console.info('Essai QR',variant,e)}}
 return null;
}
async function decode(blob){const img=await imageFromBlob(blob);const base=canvasFromImage(img);let raw=await decodeCanvas(base);if(raw)return raw;
 // Réessaie en résolution réduite : utile pour certaines photos iPhone très grandes.
 if(Math.max(base.width,base.height)>1000){const c=canvasFromImage(img,1000);raw=await decodeCanvas(c);if(raw)return raw}
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
async function importQR(input){const blob=input.files?.[0];if(!blob||busy)return;busy=true;status.textContent='Lecture du QR Code…';status.className='';try{if(!blob.type.startsWith('image/'))throw new Error('Choisissez une image.');const raw=await decode(blob);const link=raw?parseLink(raw):null;if(!link){status.textContent=raw?'Ce QR Code ne contient pas de lien HTTPS valide.':'QR Code non reconnu. Essayez une capture d’écran nette, bien cadrée et éclairée.';return}
const clean=await cleanQRCode(link);await saveQR(clean);try{localStorage.setItem(LINK_KEY,link)}catch{}
display(clean);showLink(link);status.textContent='QR Code enregistré automatiquement.';status.className='success'
}catch(e){status.textContent=e.message||'Une erreur est survenue.';status.className=''}finally{input.value='';busy=false}}
file.addEventListener('change',()=>importQR(file));

const scanner=$('scanner'),video=$('video'),scanMessage=$('scanMessage'),scanButton=$('scanButton');
let stream=null,scanActive=false,scanFrame=0,scanDetector=null,scanBusy=false;
function stopScanner(){
 scanActive=false;
 if(scanFrame)cancelAnimationFrame(scanFrame);
 scanFrame=0;
 if(stream){for(const track of stream.getTracks())track.stop();stream=null}
 video.srcObject=null;scanner.hidden=true;scanButton.disabled=false;
}
async function scanTick(){
 if(!scanActive)return;
 if(video.readyState>=2&&video.videoWidth&&!scanBusy){
  scanBusy=true;
  try{
   // Analyse une image vidéo à une résolution adaptée à chaque appareil.
   const canvas=document.createElement('canvas');const maxSide=scanFrameCount%3===0?1600:960;
   const scale=Math.min(1,maxSide/Math.max(video.videoWidth,video.videoHeight));
   canvas.width=Math.max(1,Math.round(video.videoWidth*scale));canvas.height=Math.max(1,Math.round(video.videoHeight*scale));
   canvas.getContext('2d',{willReadFrequently:true}).drawImage(video,0,0,canvas.width,canvas.height);
   const raw=await decodeCanvas(canvas,true);
   if(raw){const link=parseLink(raw);if(link){scanActive=false;scanMessage.textContent='QR Code reconnu. Enregistrement…';const blob=await cleanQRCode(link);await saveQR(blob);try{localStorage.setItem(LINK_KEY,link)}catch{}stopScanner();display(blob);showLink(link);status.textContent='QR Code scanné et enregistré automatiquement.';status.className='success';scanBusy=false;return}else scanMessage.textContent='QR Code détecté, mais sans lien HTTPS valide.'}
  }catch(e){scanMessage.textContent='Lecture impossible : '+(e.message||'réessayez')}
  scanBusy=false;scanFrameCount++;
 }
 if(scanActive)scanFrame=requestAnimationFrame(scanTick);
}
let scanFrameCount=0;
scanButton.addEventListener('click',async()=>{
 if(scanActive)return;
 if(!navigator.mediaDevices?.getUserMedia){status.textContent='La caméra en direct n’est pas disponible dans ce navigateur. Utilisez « Charger un QR Code ».';return}
 scanButton.disabled=true;scanner.hidden=false;scanMessage.textContent='Autorisez l’accès à la caméra si demandé.';
 try{
  try{stream=await navigator.mediaDevices.getUserMedia({audio:false,video:{facingMode:{ideal:'environment'},width:{ideal:1920},height:{ideal:1080}}})}catch(e){if(e.name==='NotAllowedError'||e.name==='NotFoundError')throw e;stream=await navigator.mediaDevices.getUserMedia({audio:false,video:{facingMode:'environment'}})}
  video.srcObject=stream;
  await video.play();
  scanDetector=null;
  if('BarcodeDetector'in window)try{scanDetector=new BarcodeDetector({formats:['qr_code']})}catch{}
  if(!getDetector()&&typeof jsQR!=='function')scanMessage.textContent='Lecteur indisponible. Vérifiez votre connexion Internet, puis réessayez.';
  else scanMessage.textContent='Cadrez le QR Code : la lecture est automatique.';
  scanFrameCount=0;scanActive=true;scanTick();
 }catch(e){stopScanner();status.textContent=e.name==='NotAllowedError'?'Accès à la caméra refusé. Autorisez la caméra dans les réglages du navigateur.':'Impossible d’ouvrir la caméra. Vérifiez les autorisations.'}
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
