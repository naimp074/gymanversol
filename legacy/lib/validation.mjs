import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { all, get, today } from './store.mjs';

export class HttpError extends Error { constructor(status,message) { super(message); this.status=status; } }
export function assert(condition,message,status=400) { if(!condition) throw new HttpError(status,message); }
export const roles=['dueno','administrador','recepcionista','profesor','contador'];
export const methods=['Efectivo','Transferencia','Mercado Pago','Débito','Crédito'];
export function str(value,name,{required=false,max=500}={}) { assert(value==null||typeof value==='string',`${name}: texto inválido`); const result=(value??'').trim(); assert(!required||result.length>0,`${name} es obligatorio`); assert(result.length<=max,`${name}: máximo ${max} caracteres`); return result; }
export function number(value,name,{min=0,max=100000000,integer=true,optional=false}={}) { if(optional&&(value===''||value==null)) return null; const result=typeof value==='number'?value:typeof value==='string'&&value.trim()?Number(value):NaN; assert(Number.isFinite(result)&&result>=min&&result<=max&&(!integer||Number.isInteger(result)),`${name}: valor inválido`); return result; }
export function bool(value,fallback=false) { if(value==null) return fallback; assert(typeof value==='boolean','Se esperaba verdadero o falso'); return value; }
export function enumValue(value,options,name) { assert(options.includes(value),`${name}: opción inválida`); return value; }
export function dateValue(value,name,required=false) { const result=str(value,name,{required,max:10}); if(!result) return ''; assert(/^\d{4}-\d{2}-\d{2}$/.test(result)&&!Number.isNaN(Date.parse(result))&&new Date(result).toISOString().slice(0,10)===result,`${name}: fecha inválida`); assert(result>='1900-01-01'&&result<='2200-12-31',`${name}: fecha fuera de rango`); return result; }
function timeValue(value,name,fallback) { const result=value||fallback; assert(/^([01]\d|2[0-3]):[0-5]\d$/.test(result),`${name}: hora inválida`); return result; }
export function attachment(value,name,medical=false) { if(!value) return ''; assert(typeof value==='string',`${name}: archivo inválido`); const match=/^data:(image\/(?:png|jpeg|webp)|application\/pdf);base64,([A-Za-z0-9+/=]+)$/.exec(value); assert(match&&(!(!medical&&match[1]==='application/pdf')),`${name}: formato permitido JPG, PNG, WebP${medical?' o PDF':''}`); const data=Buffer.from(match[2],'base64'); assert(data.length<=(medical?4:2)*1024*1024,`${name}: máximo ${medical?4:2} MB`); const mime=match[1]; const valid=mime==='image/png'?data.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])):mime==='image/jpeg'?data[0]===255&&data[1]===216&&data[2]===255:mime==='image/webp'?data.toString('ascii',0,4)==='RIFF'&&data.toString('ascii',8,12)==='WEBP':data.toString('ascii',0,5)==='%PDF-'; assert(valid,`${name}: contenido de archivo inválido`); return value; }
export function passwordHash(password) { assert(typeof password==='string'&&password.length>=8&&password.length<=200,'La contraseña debe tener entre 8 y 200 caracteres'); const salt=randomBytes(16).toString('hex'); return salt+':'+scryptSync(password,salt,64).toString('hex'); }
export function checkPassword(password,hash) { try { if(typeof password!=='string'||password.length>200||typeof hash!=='string') return false; const [salt,key]=hash.split(':'); if(!salt||!key||key.length%2) return false; const calculated=scryptSync(password,salt,64); const stored=Buffer.from(key,'hex'); return calculated.length===stored.length&&timingSafeEqual(calculated,stored); } catch { return false; } }
export function safeUser(user) { if(!user) return null; const {passwordHash:_,password:__,...result}=user; return result; }
export function reference(collection,id,label,required=true) { if(!id&&!required) return ''; assert(typeof id==='string'&&get(collection,id),`${label} no encontrado`); return id; }
export function entityData(collection,input,existing,user) {
 assert(input&&typeof input==='object'&&!Array.isArray(input),'Datos inválidos');
 const data={...(existing||{}),...input}; const result={};
 const text=(key,required=false,max=500)=>result[key]=str(data[key],key,{required,max});
 const num=(key,min=0,max=100000000,integer=true,optional=false)=>result[key]=number(data[key],key,{min,max,integer,optional});
 if(collection==='members') {
  text('name',true,120); text('dni',true,20); assert(/^\d{5,12}$/.test(result.dni),'El DNI debe tener entre 5 y 12 dígitos'); assert(!all('members').some(item=>item.dni===result.dni&&item.id!==existing?.id),'Ya existe un socio con ese DNI',409);
  for(const key of ['phone','whatsapp','emergencyPhone']) text(key,false,40);
  for(const key of ['email','address','emergencyName','medicalFileName']) text(key,false,250);
  assert(!result.email||/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(result.email),'Email inválido'); text('notes',false,5000);
  for(const key of ['birthDate','joinedAt','expiresAt','medicalExpiresAt']) result[key]=dateValue(data[key]||(key==='joinedAt'?today():''),key);
  assert(!result.birthDate||result.birthDate<=today(),'La fecha de nacimiento no puede ser futura');
  result.state=enumValue(data.state||'activo',['activo','suspendido','baja'],'Estado'); result.planId=reference('plans',data.planId,'Plan',false);
  result.photo=attachment(data.photo,'Foto'); result.medicalFile=attachment(data.medicalFile,'Certificado médico',true);
  result.lastPayment=existing?.lastPayment||''; result.number=existing?.number||String(Math.max(1000,...all('members').map(item=>Number(item.number)||0))+1);
  result.qrToken=existing?.qrToken||randomBytes(24).toString('hex');
  if(!['dueno','administrador'].includes(user.role)) assert(result.expiresAt===(existing?.expiresAt||''),'Sólo administración puede modificar el vencimiento sin un cobro',403);
 } else if(collection==='plans') {
  text('name',true,120); text('description',false,2000); num('price'); num('duration',1,3650); result.accessLimit=number(data.accessLimit??0,'Límite',{max:10000}); result.discount=number(data.discount??0,'Descuento',{max:100,integer:false});
  result.startTime=timeValue(data.startTime,'Horario inicial','06:00'); result.endTime=timeValue(data.endTime,'Horario final','23:00'); assert(result.startTime<result.endTime,'La hora final debe ser posterior a la inicial'); result.active=bool(data.active,true);
 } else if(collection==='products') {
  text('name',true,120); text('category',false,100); num('price'); result.cost=number(data.cost??0,'Costo'); result.stock=number(data.stock??0,'Stock',{max:1000000}); result.minStock=number(data.minStock??0,'Stock mínimo',{max:1000000}); result.active=bool(data.active,true);
 } else if(collection==='teachers') {
  text('name',true,120); text('phone',false,40); text('specialty',false,250); text('schedule',false,2000); result.salary=number(data.salary??0,'Sueldo'); result.state=enumValue(data.state||'activo',['activo','inactivo'],'Estado');
 } else if(collection==='classes') {
  text('name',true,120); text('description',false,2000); result.teacherId=reference('teachers',data.teacherId,'Profesor',false); result.date=dateValue(data.date,'Fecha',true); result.time=timeValue(data.time,'Hora','09:00'); result.duration=number(data.duration??60,'Duración',{min:1,max:1440}); result.capacity=number(data.capacity??20,'Cupo',{min:1,max:10000});
  if(existing) assert(all('reservations').filter(item=>item.classId===existing.id).length<=result.capacity,'El cupo no puede ser inferior a las reservas existentes');
 } else if(collection==='routines') {
  result.memberId=reference('members',data.memberId,'Socio'); result.teacherId=reference('teachers',data.teacherId,'Profesor',false); text('name',true,150); text('goal',false,1000); text('days',true,15000); text('notes',false,5000);
 } else if(collection==='measurements') {
  result.memberId=reference('members',data.memberId,'Socio'); result.date=dateValue(data.date,'Fecha',true); text('notes',false,3000); result.photo=attachment(data.photo,'Foto');
  for(const key of ['weight','height','waist','arm','chest','leg','bodyFat']) num(key,0,key==='bodyFat'?100:1000,false,true);
  assert(['weight','height','waist','arm','chest','leg','bodyFat'].some(key=>result[key]!==null),'Completá al menos una medida');
 } else if(collection==='users') {
  text('name',true,120); result.username=str(data.username,'Usuario',{required:true,max:60}).toLowerCase(); assert(/^[a-z0-9_.-]{3,60}$/.test(result.username),'El usuario requiere 3 a 60 letras, números, puntos o guiones'); result.role=enumValue(data.role,roles,'Rol'); result.active=bool(data.active,true);
  assert(!all('users').some(item=>item.username===result.username&&item.id!==existing?.id),'Ese nombre de usuario ya existe',409);
  assert(user.role==='dueno'||(result.role!=='dueno'&&existing?.role!=='dueno'),'Sólo el dueño puede gestionar otros dueños',403);
  assert(!existing||existing.id!==user.id||result.active,'No podés desactivar tu propio usuario');
  if(existing?.role==='dueno'&&(!result.active||result.role!=='dueno')) assert(all('users').some(item=>item.id!==existing.id&&item.role==='dueno'&&item.active),'Debe quedar al menos un dueño activo');
  result.passwordHash=input.password?passwordHash(input.password):existing?.passwordHash; assert(result.passwordHash,'La contraseña es obligatoria');
 } else throw new HttpError(404,'Recurso no encontrado');
 if(existing) { result.id=existing.id; result.createdAt=existing.createdAt; }
 return result;
}
