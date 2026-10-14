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
const docs=document.getElementById('docs'), frame=document.getElementById('driveFrame'),
  openDrive=document.getElementById('openDrive'), decodeStatus=document.getElementById('decodeStatus'),
  fileList=document.getElementById('fileList'), provider=document.getElementById('provider');
const LINK_KEY='badge-chantier-doc-url';
let currentLink=null;
function parseLink(value){
  try {const u=new URL(value.trim());
    if(u.protocol!=='https:' || u.username || u.password)return null;
    if(!['drive.google.com','docs.google.com'].includes(u.hostname) && !/^[-a-z0-9.]+$/i.test(u.hostname))return null;
    return u.href;
  } catch {return null;}
}
function getProvider(link){
 const u=new URL(link);
 if(['drive.google.com','docs.google.com'].includes(u.hostname))return 'Google Drive';
 if(/\/s\/[A-Za-z0-9]+/.test(u.pathname)||/\/index.php\/s\/[A-Za-z0-9]+/.test(u.pathname))return 'Nextcloud (partage possible)';
 return 'Autre hébergeur';
}
function resetDocs(){currentLink=null;try{localStorage.removeItem(LINK_KEY)}catch{} docs.hidden=true;frame.removeAttribute('src');openDrive.removeAttribute('href');fileList.replaceChildren();decodeStatus.textContent='Importez votre QR Code pour retrouver votre dossier.';}
function imageDataFromBlob(blob){return new Promise((resolve,reject)=>{const img=new Image(),src=URL.createObjectURL(blob);img.onload=()=>{try{const c=document.createElement('canvas'),max=1800,scale=Math.min(1,max/Math.max(img.naturalWidth,img.naturalHeight));c.width=Math.max(1,Math.round(img.naturalWidth*scale));c.height=Math.max(1,Math.round(img.naturalHeight*scale));const ctx=c.getContext('2d',{willReadFrequently:true});ctx.drawImage(img,0,0,c.width,c.height);resolve(ctx.getImageData(0,0,c.width,c.height))}catch(e){reject(e)}finally{URL.revokeObjectURL(src)}};img.onerror=()=>{URL.revokeObjectURL(src);reject(new Error('Image illisible'))};img.src=src})}
async function decodeQR(blob){
 const data=await imageDataFromBlob(blob);
 if(typeof jsQR==='function'){
  for(const inversionAttempts of ['attemptBoth','invertFirst']){const result=jsQR(data.data,data.width,data.height,{inversionAttempts});if(result?.data)return result.data;}
 }
 if('BarcodeDetector' in window){const detector=new BarcodeDetector({formats:['qr_code']});const c=document.createElement('canvas');c.width=data.width;c.height=data.height;c.getContext('2d').putImageData(data,0,0);const found=await detector.detect(c);if(found.length)return found[0].rawValue;}
 return null;
}
async function nextcloudList(link){
 // Public WebDAV is server-dependent. Browser CORS may prevent PROPFIND.
 const u=new URL(link),match=u.pathname.match(/\/s\/([^/]+)/);
 if(!match)return false;
 const endpoint=u.origin+'/public.php/dav/files/'+encodeURIComponent(match[1])+'/';
 const response=await fetch(endpoint,{method:'PROPFIND',headers:{Depth:'1',Authorization:'Basic '+btoa(match[1]+':')},mode:'cors'});
 if(!response.ok)throw new Error('WebDAV indisponible');
 const xml=new DOMParser().parseFromString(await response.text(),'application/xml');
 const rows=[...xml.getElementsByTagNameNS('DAV:','response')];
 const items=[];
 for(const row of rows){const href=row.getElementsByTagNameNS('DAV:','href')[0]?.textContent||'';const name=decodeURIComponent(href.split('/').filter(Boolean).pop()||'');const isFolder=row.getElementsByTagNameNS('DAV:','collection').length>0;
 if(!isFolder && /\.pdf$/i.test(name))items.push({name,href});}
 if(!items.length)return false;
 fileList.replaceChildren();
 const heading=document.createElement('p');heading.textContent='Fichiers PDF détectés :';fileList.append(heading);
 for(const item of items){const a=document.createElement('a');a.className='btn secondary';a.style.display='block';a.style.textAlign='left';a.textContent='📄 '+item.name;
 // Direct public WebDAV file URLs may require a password, so use public share URL fallback.
 a.href=link;a.target='_blank';a.rel='noopener noreferrer';a.title='Ouvrir le partage contenant '+item.name;fileList.append(a);}
 return true;
}
async function showDocs(link){
 currentLink=link;docs.hidden=false;openDrive.href=link;fileList.replaceChildren();provider.textContent='Source : '+getProvider(link);
 const u=new URL(link),isGoogle=['drive.google.com','docs.google.com'].includes(u.hostname);
 const match=isGoogle?u.pathname.match(/\/folders\/([^/?#]+)/):null;
 frame.src=match?'https://drive.google.com/embeddedfolderview?id='+encodeURIComponent(match[1])+'#list':link;
 if(isGoogle){decodeStatus.textContent='Dossier Google Drive détecté. Affichage intégré en cours de test.';return;}
 if(getProvider(link).startsWith('Nextcloud')){
  decodeStatus.textContent='Dossier Nextcloud détecté. Recherche des PDF…';
  try{const listed=await nextcloudList(link);decodeStatus.textContent=listed?'PDF détectés. Ouvrez le partage pour les consulter.':'Partage détecté. Consultez les documents dans la fenêtre ou via le bouton.';}
  catch{decodeStatus.textContent='Le serveur ne permet pas de lister les PDF depuis cette application. Utilisez l’affichage ou le bouton ci-dessous.';}
 }else decodeStatus.textContent='Lien détecté. L’affichage dépend des autorisations de cet hébergeur.';
}
async function detectLink(blob){
 decodeStatus.textContent='Lecture automatique du QR Code…';
 try{const content=await decodeQR(blob),link=content?parseLink(content):null;
 if(!link){docs.hidden=true;decodeStatus.textContent=content?'Ce QR Code ne contient pas de lien Web HTTPS reconnu.':'Lecture impossible. Vérifiez la netteté du QR Code et la connexion Internet au premier chargement.';return;}
 try{localStorage.setItem(LINK_KEY,link)}catch{}
 await showDocs(link);
 }catch(e){decodeStatus.textContent='Impossible de lire ce QR Code. Réessayez avec une image nette.';}
}
document.getElementById('refreshDocs').addEventListener('click',()=>{if(currentLink)showDocs(currentLink)});
