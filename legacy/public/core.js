export const state = { data: null, user: null, route: 'inicio', access: null };
export const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const money = value => new Intl.NumberFormat('es-AR', {style:'currency',currency:'ARS',maximumFractionDigits:0}).format(Number(value)||0);
export const date = value => !value ? '—' : new Date(String(value).length===10 ? `${value}T12:00:00` : value).toLocaleDateString('es-AR',{timeZone:'America/Argentina/Buenos_Aires'});
export const time = value => !value ? '—' : new Date(value).toLocaleTimeString('es-AR',{hour:'2-digit',minute:'2-digit',timeZone:'America/Argentina/Buenos_Aires'});
export const localDay = value => new Intl.DateTimeFormat('sv-SE',{timeZone:'America/Argentina/Buenos_Aires'}).format(new Date(value));
export const memberName = id => state.data?.members.find(m=>m.id===id)?.name || 'Socio';
export const empty = message => `<div class="empty">${icon('sparkles',28)}<p>${esc(message)}</p></div>`;
const paths = {
  grid:'<rect x="3" y="3" width="7" height="7" rx="2"/><rect x="14" y="3" width="7" height="7" rx="2"/><rect x="3" y="14" width="7" height="7" rx="2"/><rect x="14" y="14" width="7" height="7" rx="2"/>',
  users:'<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2m20 0v-2a4 4 0 0 0-3-3.87M15 3.13a4 4 0 0 1 0 7.75"/><circle cx="9" cy="7" r="4"/>',
  user:'<circle cx="12" cy="8" r="4"/><path d="M4 21v-2a8 8 0 0 1 16 0v2"/>',
  door:'<path d="M14 8V3H4v18h10v-5M9 12h13m-4-4 4 4-4 4"/>',
  card:'<rect x="2" y="4" width="20" height="16" rx="3"/><path d="M2 9h20M6 15h4"/>',
  calendar:'<rect x="3" y="5" width="18" height="16" rx="3"/><path d="M16 3v4M8 3v4M3 11h18m-13 4h2m4 0h2"/>',
  wallet:'<path d="M20 8V5a2 2 0 0 0-2-2H5a3 3 0 0 0 0 6h16v12H5a3 3 0 0 1-3-3V6"/><path d="M21 13h-5v4h5"/>',
  box:'<path d="m12 3 9 5v9l-9 5-9-5V8l9-5Zm-9 5 9 5 9-5m-9 5v9M7.5 5.5l9 5"/>',
  cart:'<path d="M2 3h3l3 12h11l3-8H6m3 8-1 3h12"/><circle cx="9" cy="21" r="1"/><circle cx="19" cy="21" r="1"/>',
  chart:'<path d="M3 3v18h18M7 16v-4m5 4V7m5 9v-7"/>',
  activity:'<path d="M2 12h4l3-9 6 18 3-9h4"/>',
  dumbbell:'<path d="m6.5 6.5 11 11M4 3 3 4l4 4 1-1M16 16l-1 1 5 5 2-2-5-5-1 1ZM3 8l5-5 4 4-5 5-4-4Z"/>',
  message:'<path d="M21 11.5a8.4 8.4 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.4 8.4 0 0 1-3.8-.9L3 21l1.9-5.7a8.4 8.4 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.4 8.4 0 0 1 3.8-.9h.5a8.5 8.5 0 0 1 8 8v.5Z"/>',
  settings:'<path d="m9 3-1 3-3 1-2 4 2 2v3l3 2 1 3h6l1-3 3-2v-3l2-2-2-4-3-1-1-3H9Z"/><circle cx="12" cy="12" r="3"/>',
  shield:'<path d="m12 3 9 4v6c0 5-9 9-9 9s-9-4-9-9V7l9-4Z"/><path d="m8 12 3 3 5-6"/>',
  search:'<circle cx="10.5" cy="10.5" r="7.5"/><path d="m16 16 5 5"/>',
  bell:'<path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9m-9 12h6"/>',
  plus:'<path d="M12 5v14M5 12h14"/>',
  arrow:'<path d="M4 12h16m-6-6 6 6-6 6"/>',
  chevron:'<path d="m9 5 7 7-7 7"/>',
  down:'<path d="m6 9 6 6 6-6"/>',
  up:'<path d="m7 14 5-5 5 5m-5-5v11"/>',
  arrowUpRight:'<path d="M7 17 17 7M7 7h10v10"/>',
  check:'<path d="m5 12 4 4L19 6"/>',
  close:'<path d="m6 6 12 12M6 18 18 6"/>',
  logout:'<path d="M9 3H3v18h6m5-14 5 5-5 5M8 12h13"/>',
  menu:'<path d="M3 6h18M3 12h18M3 18h18"/>',
  clock:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  download:'<path d="M12 3v12m-5-5 5 5 5-5M4 15v6h16v-6"/>',
  edit:'<path d="m16 3 5 5L9 20l-6 1 1-6L16 3Zm-3 3 5 5"/>',
  heart:'<path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z"/>',
  gift:'<rect x="3" y="8" width="18" height="4" rx="1"/><path d="M5 12v9h14v-9M12 8v13m0-13H8a3 3 0 1 1 3-3l1 3Zm0 0h4a3 3 0 1 0-3-3l-1 3Z"/>',
  alert:'<path d="m12 3 10 18H2L12 3Zm0 6v5m0 3v1"/>',
  fingerprint:'<path d="M4 10a8 8 0 0 1 16 0m-13 5v-5a5 5 0 0 1 10 0v5m-7 5v-9a2 2 0 0 1 4 0v6c0 2-1 4-2 5M4 14v4m16-4v4M7 18v3"/>',
  wifi:'<path d="M2 8a16 16 0 0 1 20 0M5 12a11 11 0 0 1 14 0m-11 4a6 6 0 0 1 8 0m-4 4h.01"/>',
  sparkles:'<path d="m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5L12 3Z"/>',
  sun:'<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1 1m12 12 1 1M5 19l1-1M18 6l1-1"/>',
  qr:'<path d="M3 3h7v7H3V3Zm11 0h7v7h-7V3ZM3 14h7v7H3v-7Zm11 0h3v3h4v4h-7v-7Z"/>',
  lock:'<rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V6a4 4 0 0 1 8 0v4m-4 5v2"/>',
  zap:'<path d="M13 2 4 14h7l-1 8 9-12h-7l1-8Z"/>',
  layers:'<path d="m12 3 9 5-9 5-9-5 9-5Zm-9 9 9 5 9-5M3 17l9 5 9-5"/>',
  tag:'<path d="M12 3H4v8l9 9 8-8-9-9Z"/><circle cx="7.5" cy="7.5" r="1.2"/>',
  minus:'<path d="M5 12h14"/>',
  unlock:'<rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 7.5-2"/>',
  'trending-up':'<path d="M3 17 10 10l4 4 7-7M14 7h7v7"/>',
  'trending-down':'<path d="m3 7 7 7 4-4 7 7M14 17h7v-7"/>',
  banknote:'<rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="2"/><path d="M6 12h.01M18 12h.01"/>',
  package:'<path d="m12 3 8 4.5v9L12 21 4 16.5v-9L12 3Zm-8 4.5 8 4.5 8-4.5M12 21v-9"/>',
  boxes:'<path d="M8 4h8v6H8V4Zm-4 8h8v8H4v-8Zm12 0h8v8h-8v-8Z"/>',
  droplet:'<path d="M12 3c4 5 7 8 7 11a7 7 0 1 1-14 0c0-3 3-6 7-11Z"/>',
  shirt:'<path d="M4 6 8 3h8l4 3-3 3v12H7V9L4 6Z"/>',
  phone:'<rect x="7" y="2" width="10" height="20" rx="2"/><path d="M11 18h2"/>',
  printer:'<path d="M7 17H5a2 2 0 0 1-2-2V9h18v6a2 2 0 0 1-2 2h-2M7 13h10V3H7v10Zm0 0v8h10v-8"/>',
  ruler:'<path d="m21 8-5-5L3 16l5 5L21 8ZM8 13l1.5 1.5M11 10l1.5 1.5M14 7l1.5 1.5"/>'
};
const aliases={'shopping-cart':'cart','alert-triangle':'alert'};
export function icon(name,size=20){const key=aliases[name]||name;return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[key]||paths.grid}</svg>`;}
export const badge = (text,tone='neutral') => `<span class="badge badge-${esc(tone)}"><i></i>${esc(text)}</span>`;
export function avatar(member){const name=member?.name||'?';const colors=['peach','blue','lavender','mint','sand'];const color=colors[Array.from(name).reduce((a,c)=>a+c.charCodeAt(0),0)%5];return member?.photo?.startsWith('data:image/')?`<span class="avatar ${color}"><img src="${esc(member.photo)}" alt="${esc(name)}"></span>`:`<span class="avatar ${color}">${esc(name.split(' ').filter(Boolean).slice(0,2).map(n=>n[0]).join(''))}</span>`;}
export function field(label,name,type='text',value='',extra=''){return `<label class="field"><span>${esc(label)}</span><input name="${esc(name)}" type="${esc(type)}" value="${esc(value)}" ${extra}></label>`;}
export async function imageDataUrl(file,maxBytes=2*1024*1024){
  if(!file||!file.size)return null;
  const type=(file.type||'').toLowerCase();
  if(type&&!type.startsWith('image/'))throw new Error('Elegí una foto desde la cámara o la galería.');
  if(file.size>30*1024*1024)throw new Error('La foto es demasiado pesada. Sacala de nuevo o elegí otra.');
  const img=await new Promise((resolve,reject)=>{const url=URL.createObjectURL(file);const image=new Image();image.onload=()=>{URL.revokeObjectURL(url);resolve(image);};image.onerror=()=>{URL.revokeObjectURL(url);reject(new Error('No se pudo leer la foto. En el celular usá la cámara o una imagen JPG.'));};image.src=url;});
  const canvas=document.createElement('canvas');
  const draw=size=>{const scale=Math.min(1,size/Math.max(img.naturalWidth||img.width,img.naturalHeight||img.height,1));canvas.width=Math.max(1,Math.round((img.naturalWidth||img.width)*scale));canvas.height=Math.max(1,Math.round((img.naturalHeight||img.height)*scale));const ctx=canvas.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(img,0,0,canvas.width,canvas.height);};
  let size=1280,quality=0.82,data='';
  for(let i=0;i<8;i++){draw(size);data=canvas.toDataURL('image/jpeg',quality);const bytes=Math.ceil((data.length-23)*3/4);if(bytes<=maxBytes)return data;quality-=0.12;if(quality<0.45){quality=0.72;size=Math.round(size*0.72);}}
  throw new Error('No se pudo comprimir la foto. Probá sacarla otra vez.');
}
export function selectField(label,name,options,value=''){return `<label class="field"><span>${esc(label)}</span><select name="${esc(name)}">${options.map(o=>`<option value="${esc(o.value)}" ${String(o.value)===String(value)?'selected':''}>${esc(o.label)}</option>`).join('')}</select></label>`;}
export async function api(path,options={}){const headers={...options.headers};if(options.body!==undefined)headers['Content-Type']='application/json';let response;try{response=await fetch(path,{...options,headers,body:options.body!==undefined?JSON.stringify(options.body):undefined,credentials:'same-origin'});}catch{throw new Error('No se pudo conectar con la PC principal. Revisá que el servidor esté encendido.');}const data=await response.json().catch(()=>({}));if(!response.ok){if(response.status===401&&state.user){state.user=null;document.dispatchEvent(new CustomEvent('session-expired'));}throw new Error(data.error||'No se pudo completar la operación.');}return data;}
export function toast(message,type='success'){const el=document.createElement('div');el.className=`toast ${type}`;el.innerHTML=`${icon(type==='error'?'alert':'check')}<span>${esc(message)}</span>`;document.getElementById('toasts').append(el);setTimeout(()=>el.remove(),5000);}
let previousFocus;
export function closeModal(){document.getElementById('modal-root').replaceChildren();document.body.classList.remove('modal-open');previousFocus?.focus?.();}
export function modal(title,html,onSubmit,wide=false){previousFocus=document.activeElement;const root=document.getElementById('modal-root');root.innerHTML=`<div class="modal-backdrop"><section class="modal ${wide?'modal-wide':''}" role="dialog" aria-modal="true" aria-labelledby="modal-title"><header class="modal-head"><div><span class="eyebrow">ANVERSOL GYM</span><h2 id="modal-title">${esc(title)}</h2></div><button type="button" class="icon-btn" data-action="modal-close" aria-label="Cerrar">${icon('close')}</button></header><form id="modal-form"><div class="modal-content">${html}</div><div class="form-error" role="alert" hidden></div><footer class="modal-footer"><button type="button" class="btn btn-secondary" data-action="modal-close">${onSubmit?'Cancelar':'Cerrar'}</button>${onSubmit?'<button type="submit" class="btn btn-primary">Guardar</button>':''}</footer></form></section></div>`;document.body.classList.add('modal-open');const form=root.querySelector('form');const label=form.querySelector('[data-submit-label]')?.dataset.submitLabel;if(label&&onSubmit)form.querySelector('button[type=submit]').textContent=label;
form.addEventListener('submit',async e=>{e.preventDefault();if(!onSubmit)return closeModal();const submit=form.querySelector('button[type=submit]');submit.disabled=true;const error=form.querySelector('.form-error');error.hidden=true;try{await onSubmit(new FormData(form),form);if(root.contains(form))closeModal();await refresh();}catch(e){error.textContent=e.message;error.hidden=false;submit.disabled=false;}});
setTimeout(()=>root.querySelector('input:not([type=hidden]), select, textarea, button')?.focus(),20);
root.querySelector('.modal-backdrop').addEventListener('click',e=>{if(e.target===e.currentTarget)closeModal();});
}
export function confirmAction(title,message,callback){modal(title,`<p>${esc(message)}</p>`,callback);}
export async function refresh(){if(!state.user)return;state.data=await api('/api/bootstrap');state.user=state.data.user;document.dispatchEvent(new CustomEvent('app-render'));}
export function navigate(route){state.route=route;history.replaceState(null,'',`#${route}`);document.dispatchEvent(new CustomEvent('app-render'));document.body.classList.remove('nav-open');window.scrollTo(0,0);}
document.addEventListener('keydown',e=>{const dialog=document.querySelector('[role=dialog]');if(!dialog)return;if(e.key==='Escape')closeModal();if(e.key==='Tab'){const els=[...dialog.querySelectorAll('button:not([disabled]),input:not([disabled]),select,textarea,a[href]')].filter(x=>x.offsetParent!==null);if(e.shiftKey&&document.activeElement===els[0]){e.preventDefault();els.at(-1)?.focus();}else if(!e.shiftKey&&document.activeElement===els.at(-1)){e.preventDefault();els[0]?.focus();}}});
