import http from 'node:http';
import { readFileSync, statSync, existsSync } from 'node:fs';
import { resolve, join, extname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes, createHash } from 'node:crypto';
import { db, all, get, put, remove, metadata, setMetadata, audit, auditList, transaction, memberView, now, today, addDays, localDate, localTime, createBackup, backupList, backupPath, dailyBackup, dataDirectory, findMember, findUserByUsername, activeCashSession, memberCheckins, openEntry, sessionMovements, touchSession } from './lib/store.mjs';
import { assert, HttpError, str, number, bool, enumValue, dateValue, passwordHash, checkPassword, safeUser, reference, entityData, methods } from './lib/validation.mjs';
import { seedDemo } from './lib/demo.mjs';
import { advertiseMdns, lanIPv4, mdnsName } from './lib/mdns.mjs';

const HOST=process.env.HOST||'127.0.0.1';
const PORT=Number(process.env.PORT||3000);
const lanMode=['0.0.0.0','::'].includes(HOST);
function accessInfo(){
 const urls=lanMode?lanIPv4().map(ip=>`http://${ip}:${PORT}`):[`http://127.0.0.1:${PORT}`];
 return {lan:lanMode,name:mdnsName,url:lanMode?`http://${mdnsName}${PORT===80?'':`:${PORT}`}`:`http://localhost:${PORT}`,urls};
}
const publicDirectory=join(fileURLToPath(new URL('.',import.meta.url)),'public');
const admin=['dueno','administrador'];
const finance=[...admin,'recepcionista','contador'];
const training=[...admin,'profesor','recepcionista'];
const permissions={members:[...admin,'recepcionista'],plans:admin,products:[...admin,'contador'],teachers:admin,classes:[...admin,'profesor'],routines:training,measurements:training,users:admin};
const attempts=new Map();
const memberAttempts=new Map();
const siteFields={tagline:160,about:2000,hours:300,whatsapp:40,instagram:120,email:250};
const defaultSettings={gymName:'Anversol',allowExpiredOverride:false,allowExpiredEntry:false,requireMedical:false,address:'',phone:'',demo:false,tagline:'',about:'',hours:'',whatsapp:'',instagram:'',email:''};
const settings=()=>metadata('settings',defaultSettings);
const cleanUser=user=>user?{id:user.id,name:user.name,username:user.username,role:user.role}:null;
const sha=value=>createHash('sha256').update(value).digest('hex');

function json(response,status,value) { response.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'}); response.end(JSON.stringify(value)); }
function role(user,allowed) { assert(user, 'Iniciá sesión para continuar',401); assert(allowed.includes(user.role),'No tenés permisos para esta acción',403); }
function sessionUser(request) { const token=/\bgym_session=([^;]+)/.exec(request.headers.cookie||'')?.[1]; if(!token)return null; const session=db.prepare('SELECT * FROM sessions WHERE token=? AND expiresAt>?').get(sha(token),Date.now()); if(!session)return null; const user=get('users',session.userId); return user?.active?user:null; }
function setSession(response,user) { const token=randomBytes(32).toString('hex'); const expiresAt=Date.now()+12*3600000; db.prepare('INSERT INTO sessions(token,userId,expiresAt) VALUES(?,?,?)').run(sha(token),user.id,expiresAt); db.prepare('DELETE FROM sessions WHERE expiresAt<?').run(Date.now()); response.setHeader('Set-Cookie',`gym_session=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=43200${process.env.COOKIE_SECURE==='true'?'; Secure':''}`); }
function rejectOrigin(request) { const origin=request.headers.origin; if(origin) { let parsed; try {parsed=new URL(origin);}catch{throw new HttpError(403,'Origen no permitido');} assert(['http:','https:'].includes(parsed.protocol)&&parsed.host===request.headers.host,'Origen no permitido',403); } assert(!['cross-site'].includes(request.headers['sec-fetch-site']),'Origen no permitido',403); }
async function body(request) { const chunks=[]; let size=0; for await(const chunk of request) {size+=chunk.length;assert(size<=10*1024*1024,'Los archivos superan el tamaño permitido',413);chunks.push(chunk);} if(!size)return {}; assert((request.headers['content-type']||'').includes('application/json'),'Se requiere contenido JSON',415); let value; try{value=JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{throw new HttpError(400,'JSON inválido');} assert(value&&typeof value==='object'&&!Array.isArray(value),'Datos inválidos');return value; }
function cashSession() { const session=activeCashSession();assert(session,'Abrí la caja antes de registrar operaciones',409);return session; }
function expectedCash(session) { return session.openingAmount+sessionMovements(session.id).filter(item=>item.method==='Efectivo').reduce((total,item)=>total+(item.type==='ingreso'?item.amount:-item.amount),0); }
function movement(user,session,data) { return put('movements',{...data,date:now(),sessionId:session.id,userId:user.id}); }
function safeMember(member,user) { const value=memberView(member); if(['profesor','contador'].includes(user.role)) { delete value.medicalFile;delete value.medicalFileName;delete value.medicalExpiresAt;delete value.emergencyName;delete value.emergencyPhone; } if(user.role==='contador'){delete value.photo;delete value.notes;} if(user.role==='profesor')delete value.lastPayment;return value; }
function bootstrap(user) {
 const isAdmin=admin.includes(user.role);const hasFinance=finance.includes(user.role);const hasTraining=training.includes(user.role);
 return {user:cleanUser(user),today:today(),settings:settings(),members:all('members').map(member=>safeMember(member,user)),plans:all('plans').map(plan=>user.role==='profesor'?{...plan,price:0,discount:0}:plan),checkins:all('checkins'),payments:hasFinance?all('payments'):[],movements:hasFinance?all('movements'):[],cashSessions:hasFinance?all('cashSessions').map(item=>({...item,expectedAmount:item.closedAt?item.expectedAmount:expectedCash(item)})):[],products:hasFinance?all('products'):[],sales:hasFinance?all('sales'):[],teachers:all('teachers').map(item=>{if(isAdmin||user.role==='contador')return item;const {salary,...value}=item;return value;}),classes:all('classes'),reservations:all('reservations'),routines:hasTraining?all('routines'):[],measurements:hasTraining?all('measurements'):[],users:isAdmin?all('users').map(safeUser):[],audit:isAdmin||user.role==='contador'?auditList():[],backups:isAdmin?backupList():[]};
}

function publicInfo() {
 const config=settings();const day=today();const time=localTime();const until=addDays(day,14);
 const teachers=all('teachers').filter(item=>item.state!=='inactivo');const teacherName=id=>all('teachers').find(item=>item.id===id)?.name||'';
 const reservations=all('reservations');
 const plans=all('plans').filter(item=>item.active!==false).map(item=>({id:item.id,name:item.name,description:item.description||'',price:Math.round(item.price*(1-(item.discount||0)/100)),fullPrice:item.price,discount:item.discount||0,duration:item.duration,accessLimit:item.accessLimit||0,startTime:item.startTime,endTime:item.endTime})).sort((a,b)=>a.price-b.price);
 const classes=all('classes').filter(item=>item.date<=until&&(item.date>day||(item.date===day&&item.time>time))).sort((a,b)=>(a.date+a.time).localeCompare(b.date+b.time)).slice(0,24).map(item=>({id:item.id,name:item.name,description:item.description||'',date:item.date,time:item.time,duration:item.duration,teacher:teacherName(item.teacherId),capacity:item.capacity,spots:Math.max(0,item.capacity-reservations.filter(value=>value.classId===item.id).length)}));
 const month=day.slice(0,7);
 const activeMembers=all('members').filter(item=>!['suspendido','baja'].includes(item.state)&&item.expiresAt&&item.expiresAt>=day).length;
 const visitsMonth=all('checkins').filter(item=>item.allowed&&localDate(item.date).startsWith(month)).length;
 const opening=plans.length?{start:plans.reduce((min,item)=>item.startTime<min?item.startTime:min,'23:59'),end:plans.reduce((max,item)=>item.endTime>max?item.endTime:max,'00:00')}:null;
 const site={gymName:config.gymName,address:config.address||'',phone:config.phone||''};for(const key of Object.keys(siteFields))site[key]=config[key]||'';
 return {...site,today:day,opening,plans,classes,teachers:teachers.map(item=>({id:item.id,name:item.name,specialty:item.specialty||'',schedule:item.schedule||''})),stats:{activeMembers,teachers:teachers.length,classes:classes.length,visitsMonth}};
}
const memberToken=request=>/\bgym_member=([^;]+)/.exec(request.headers.cookie||'')?.[1];
function sessionMember(request) { const token=memberToken(request); if(!token)return null; const session=db.prepare('SELECT * FROM member_sessions WHERE token=? AND expiresAt>?').get(sha(token),Date.now()); if(!session)return null; const member=get('members',session.memberId); return member&&member.state!=='baja'?member:null; }
function setMemberSession(response,member) { const token=randomBytes(32).toString('hex'); const days=30; db.prepare('INSERT INTO member_sessions(token,memberId,expiresAt) VALUES(?,?,?)').run(sha(token),member.id,Date.now()+days*86400000); db.prepare('DELETE FROM member_sessions WHERE expiresAt<?').run(Date.now()); response.setHeader('Set-Cookie',`gym_member=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${days*86400}${process.env.COOKIE_SECURE==='true'?'; Secure':''}`); }
function memberPortal(member) {
 const view=memberView(member);const day=today();const teachers=all('teachers');const teacherName=id=>teachers.find(item=>item.id===id)?.name||'';const classes=all('classes');const plan=get('plans',member.planId);
 const since=addDays(day,-400);
 const visits=memberCheckins(member.id).filter(item=>item.allowed&&localDate(item.date)>=since).map(item=>item.date).sort();
 const reservations=all('reservations').filter(item=>item.memberId===member.id).map(item=>{const cls=classes.find(value=>value.id===item.classId);return cls&&cls.date>=day?{name:cls.name,date:cls.date,time:cls.time,duration:cls.duration,teacher:teacherName(cls.teacherId)}:null;}).filter(Boolean).sort((a,b)=>(a.date+a.time).localeCompare(b.date+b.time));
 const routines=all('routines').filter(item=>item.memberId===member.id).map(item=>({id:item.id,name:item.name,goal:item.goal||'',days:item.days||'',notes:item.notes||'',teacher:teacherName(item.teacherId),createdAt:item.createdAt}));
 const measurements=all('measurements').filter(item=>item.memberId===member.id).map(({photo,memberId,...item})=>item).sort((a,b)=>a.date.localeCompare(b.date));
 return {gymName:settings().gymName,today:day,member:{name:view.name,number:view.number,photo:view.photo||'',planName:view.planName,status:view.status,daysLeft:view.daysLeft,expiresAt:view.expiresAt||'',joinedAt:view.joinedAt||'',lastCheckin:view.lastCheckin,accessLimit:plan?.accessLimit||0,startTime:plan?.startTime||'',endTime:plan?.endTime||''},visits,reservations,routines,measurements};
}

let apiChain=Promise.resolve();
function serialize(task){const run=apiChain.then(task,task);apiChain=run.then(()=>undefined,()=>undefined);return run;}

async function api(request,response,url) {
 const path=url.pathname; const method=request.method;
 if(!['GET','HEAD'].includes(method))rejectOrigin(request);
 const user=sessionUser(request);
 if(method==='GET'&&path==='/api/health')return json(response,200,{ok:true,time:now()});
 if(method==='GET'&&path==='/api/session')return json(response,200,{user:cleanUser(user),needsSetup:all('users').length===0,access:accessInfo()});
 if(method==='GET'&&path==='/api/public')return json(response,200,publicInfo());
 if(method==='POST'&&path==='/api/member/login') {
  const input=await body(request);const dni=str(input.dni,'DNI',{required:true,max:20}).replace(/\D/g,'');const key=request.socket.remoteAddress||'';const recent=memberAttempts.get(key)||{count:0,since:Date.now()};if(Date.now()-recent.since>15*60000){recent.count=0;recent.since=Date.now();}assert(recent.count<10,'Demasiados intentos. Intentá de nuevo en 15 minutos',429);
  const member=/^\d{5,12}$/.test(dni)?findMember(dni):null;
  if(!member||member.dni!==dni||member.state==='baja'){recent.count++;memberAttempts.set(key,recent);throw new HttpError(404,'No encontramos un socio activo con ese DNI. Consultá en recepción.');}
  memberAttempts.delete(key);setMemberSession(response,member);audit(null,'Ingreso al portal de socios',member.id,member.name);return json(response,200,memberPortal(member));
 }
 if(path==='/api/member'&&method==='GET'){const member=sessionMember(request);assert(member,'Ingresá con tu DNI para continuar',401);return json(response,200,memberPortal(member));}
 if(method==='POST'&&path==='/api/member/logout'){const token=memberToken(request);if(token)db.prepare('DELETE FROM member_sessions WHERE token=?').run(sha(token));response.setHeader('Set-Cookie','gym_member=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0');return json(response,200,{ok:true});}
 if(method==='POST'&&path==='/api/setup') {
  const input=await body(request);assert(all('users').length===0,'El sistema ya está configurado',409);
  const name=str(input.name,'Nombre',{required:true,max:120});const username=str(input.username,'Usuario',{required:true,max:60}).toLowerCase();assert(/^[a-z0-9_.-]{3,60}$/.test(username),'El usuario requiere 3 a 60 letras, números, puntos o guiones');const hash=passwordHash(input.password);const demo=bool(input.demo,false);
  const owner=transaction(()=>{assert(all('users').length===0,'El sistema ya está configurado',409);const value=put('users',{name,username,passwordHash:hash,role:'dueno',active:true});setMetadata('settings',{...defaultSettings,demo});if(demo)seedDemo(value);audit(value,'Configuración inicial',value.id,demo?'Se crearon datos de demostración':'Sistema inicializado sin datos de demostración');return value;});setSession(response,owner);dailyBackup();return json(response,201,{user:cleanUser(owner)});
 }
 if(method==='POST'&&path==='/api/login') {
  const input=await body(request);const username=str(input.username,'Usuario',{required:true,max:60}).toLowerCase();const key=`${request.socket.remoteAddress}:${username}`;const recent=attempts.get(key)||{count:0,since:Date.now()}; if(Date.now()-recent.since>15*60000){recent.count=0;recent.since=Date.now();} assert(recent.count<10,'Demasiados intentos. Intentá de nuevo en 15 minutos',429);const account=findUserByUsername(username);
  if(!account?.active||!checkPassword(input.password,account.passwordHash)){recent.count++;attempts.set(key,recent);throw new HttpError(401,'Usuario o contraseña incorrectos');} attempts.delete(key);setSession(response,account);audit(account,'Inicio de sesión',account.id);return json(response,200,{user:cleanUser(account)});
 }
 assert(user,'Iniciá sesión para continuar',401);
 if(method==='POST'&&path==='/api/logout') { const token=/\bgym_session=([^;]+)/.exec(request.headers.cookie||'')?.[1];if(token)db.prepare('DELETE FROM sessions WHERE token=?').run(sha(token));response.setHeader('Set-Cookie','gym_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0');audit(user,'Cierre de sesión',user.id);return json(response,200,{ok:true}); }
 if(method==='POST'&&path==='/api/password') {
  const input=await body(request);assert(checkPassword(input.currentPassword,user.passwordHash),'La contraseña actual es incorrecta',401);const hash=passwordHash(input.newPassword);const token=/\bgym_session=([^;]+)/.exec(request.headers.cookie||'')?.[1];
  transaction(()=>{put('users',{...get('users',user.id),passwordHash:hash});if(token)db.prepare('DELETE FROM sessions WHERE userId=? AND token<>?').run(user.id,sha(token));else db.prepare('DELETE FROM sessions WHERE userId=?').run(user.id);audit(user,'Cambiar contraseña',user.id);});return json(response,200,{ok:true});
 }
 if(method==='GET'&&path==='/api/bootstrap'){const token=/\bgym_session=([^;]+)/.exec(request.headers.cookie||'')?.[1];if(token)touchSession(sha(token),Date.now()+12*3600000);return json(response,200,bootstrap(user));}
 if(method==='PUT'&&path==='/api/settings') {role(user,admin);const input=await body(request);const updated={...settings()};for(const key of ['gymName','address','phone'])if(key in input)updated[key]=str(input[key],key,{required:key==='gymName',max:key==='phone'?40:250});for(const [key,max] of Object.entries(siteFields))if(key in input)updated[key]=str(input[key],key,{max});if(updated.email)assert(/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(updated.email),'Email inválido');for(const key of ['allowExpiredOverride','allowExpiredEntry','requireMedical'])if(key in input)updated[key]=bool(input[key]);transaction(()=>{setMetadata('settings',updated);audit(user,'Actualizar configuración');});return json(response,200,updated);}
 if(method==='POST'&&path==='/api/payments') {
  role(user,finance);const input=await body(request);
  const result=transaction(()=>{const member=get('members',reference('members',input.memberId,'Socio'));assert(member.state!=='baja','Reactivá al socio antes de cobrar una cuota');const plan=get('plans',reference('plans',input.planId,'Plan'));assert(plan.active,'El plan está desactivado');const paymentMethod=enumValue(input.method,methods,'Medio de pago');const discount=number(input.discount??0,'Descuento',{max:100,integer:false});if(discount>0)role(user,admin);const session=cashSession();const amount=Math.round(plan.price*(1-plan.discount/100)*(1-discount/100));const base=member.expiresAt&&member.expiresAt>today()?member.expiresAt:today();const expiresAt=addDays(base,plan.duration);const payment=put('payments',{memberId:member.id,planId:plan.id,amount,method:paymentMethod,date:now(),expiresAt,userId:user.id,discount,planDiscount:plan.discount,sessionId:session.id});const saved=put('members',{...member,planId:plan.id,expiresAt,lastPayment:payment.date});movement(user,session,{type:'ingreso',category:'Cuotas',description:`Cuota ${plan.name} · ${member.name}`,amount,method:paymentMethod,paymentId:payment.id});audit(user,'Cobrar cuota',payment.id,`${member.name} · $${amount} · ${paymentMethod}`);return {payment,member:safeMember(saved,user)};});return json(response,201,result);
 }
 if(method==='POST'&&path==='/api/checkins') {
  role(user,[...admin,'recepcionista']);const input=await body(request);const identifier=str(input.identifier,'Identificación',{required:true,max:250});const entryMethod=enumValue(input.method||'manual',['manual','qr'],'Método');const override=bool(input.override,false);
  const result=transaction(()=>{const member=findMember(identifier,entryMethod);assert(member,'No se encontró un socio con esa identificación',404);const memberStatus=memberView(member);const plan=get('plans',member.planId);let reason='Ingreso permitido';let allowed=true;const reject=message=>{allowed=false;reason=message;};const config=settings();const visits=memberCheckins(member.id);
   if(member.state==='suspendido')reject('Socio suspendido');else if(member.state==='baja')reject('Socio dado de baja');else if(!plan)reject('El socio no tiene un plan asignado');else if(memberStatus.status==='vencido'&&!config.allowExpiredEntry&&!(override&&config.allowExpiredOverride))reject('Cuota vencida');else if(config.requireMedical&&(!member.medicalExpiresAt||member.medicalExpiresAt<today()))reject('Certificado médico vencido o pendiente');else if(plan.startTime>localTime()||plan.endTime<localTime())reject('Fuera del horario permitido por el plan');else if(plan.accessLimit>0&&visits.filter(item=>item.allowed&&localDate(item.date)>=(member.lastPayment?(member.lastPayment.length===10?member.lastPayment:localDate(member.lastPayment)):member.expiresAt?addDays(member.expiresAt,-plan.duration):today())).length>=plan.accessLimit)reject('Se alcanzó el límite de accesos del plan');else if(openEntry(member.id))reject('El socio ya tiene un ingreso abierto');
   if(allowed&&memberStatus.status==='vencido')reason=override?'Ingreso autorizado con cuota vencida':'Ingreso permitido con cuota vencida';const checkin=put('checkins',{memberId:member.id,date:now(),allowed,reason,method:entryMethod,checkoutAt:null,userId:user.id,override:allowed&&override});audit(user,allowed?'Registrar ingreso':'Ingreso rechazado',checkin.id,`${member.name}: ${reason}`);return {checkin,member:safeMember(member,user),allowed,reason};});return json(response,201,result);
 }
 const checkout=/^\/api\/checkins\/([^/]+)\/checkout$/.exec(path);
 if(method==='POST'&&checkout){role(user,[...admin,'recepcionista']);const result=transaction(()=>{const item=get('checkins',checkout[1]);assert(item,'Ingreso no encontrado',404);assert(item.allowed,'No se puede registrar salida de un ingreso rechazado');assert(!item.checkoutAt,'La salida ya estaba registrada',409);const saved=put('checkins',{...item,checkoutAt:now()});audit(user,'Registrar salida',item.id);return saved;});return json(response,200,result);}
 if(method==='POST'&&path==='/api/cash/open') {role(user,finance);const input=await body(request);const result=transaction(()=>{assert(!activeCashSession(),'Ya existe una caja abierta',409);const saved=put('cashSessions',{openedAt:now(),closedAt:null,openingAmount:number(input.openingAmount??0,'Monto inicial'),countedAmount:null,expectedAmount:null,difference:null,userId:user.id});audit(user,'Abrir caja',saved.id,`Fondo inicial $${saved.openingAmount}`);return {...saved,expectedAmount:saved.openingAmount};});return json(response,201,result);}
 if(method==='POST'&&path==='/api/cash/close') {role(user,finance);const input=await body(request);const result=transaction(()=>{const session=cashSession();const countedAmount=number(input.countedAmount,'Efectivo contado');const expectedAmount=expectedCash(session);const saved=put('cashSessions',{...session,closedAt:now(),countedAmount,expectedAmount,difference:countedAmount-expectedAmount,notes:str(input.notes,'Notas',{max:2000}),closedBy:user.id});audit(user,'Cerrar caja',saved.id,`Esperado $${expectedAmount}; contado $${countedAmount}; diferencia $${saved.difference}`);return saved;});return json(response,200,result);}
 if(method==='POST'&&path==='/api/movements') {role(user,finance);const input=await body(request);const result=transaction(()=>{const session=cashSession();const saved=movement(user,session,{type:enumValue(input.type,['ingreso','gasto','retiro'],'Tipo'),category:str(input.category,'Categoría',{required:true,max:100}),description:str(input.description,'Descripción',{required:true,max:1000}),amount:number(input.amount,'Importe',{min:1}),method:enumValue(input.method,methods,'Medio de pago')});audit(user,'Registrar movimiento',saved.id,`${saved.type}: $${saved.amount} · ${saved.description}`);return saved;});return json(response,201,result);}
 if(method==='POST'&&path==='/api/sales') {role(user,finance);const input=await body(request);const result=transaction(()=>{const session=cashSession();const saleMethod=enumValue(input.method,methods,'Medio de pago');assert(Array.isArray(input.items)&&input.items.length>0&&input.items.length<=100,'Agregá entre 1 y 100 productos');const quantities=new Map();for(const item of input.items){assert(item&&typeof item==='object','Producto inválido');const id=reference('products',item.productId,'Producto');const quantity=number(item.quantity,'Cantidad',{min:1,max:100000});quantities.set(id,(quantities.get(id)||0)+quantity);}const items=[];let total=0;for(const [id,quantity]of quantities){const product=get('products',id);assert(product.active,`El producto ${product.name} está desactivado`);assert(product.stock>=quantity,`Stock insuficiente de ${product.name}`,409);const subtotal=product.price*quantity;total+=subtotal;items.push({productId:id,name:product.name,quantity,price:product.price,subtotal});put('products',{...product,stock:product.stock-quantity});}assert(total<=100000000,'El total de la venta supera el máximo permitido');const saved=put('sales',{items,total,method:saleMethod,date:now(),voided:false,sessionId:session.id,userId:user.id});movement(user,session,{type:'ingreso',category:'Ventas',description:`Venta ${saved.id.slice(0,8)}`,amount:total,method:saleMethod,saleId:saved.id});audit(user,'Registrar venta',saved.id,`$${total} · ${items.length} productos`);return saved;});return json(response,201,result);}
 const voidSale=/^\/api\/sales\/([^/]+)\/void$/.exec(path);
 if(method==='POST'&&voidSale){role(user,admin);const input=await body(request);const result=transaction(()=>{const sale=get('sales',voidSale[1]);assert(sale,'Venta no encontrada',404);assert(!sale.voided,'La venta ya está anulada',409);const reason=str(input.reason,'Motivo',{required:true,max:1000});const session=cashSession();for(const item of sale.items){const product=get('products',item.productId);assert(product,'No se puede reponer un producto inexistente',409);put('products',{...product,stock:product.stock+item.quantity});}const saved=put('sales',{...sale,voided:true,voidedAt:now(),voidedBy:user.id,voidReason:reason});movement(user,session,{type:'gasto',category:'Anulación de venta',description:`Anulación ${sale.id.slice(0,8)}: ${reason}`,amount:sale.total,method:sale.method,saleId:sale.id});audit(user,'Anular venta',sale.id,reason);return saved;});return json(response,200,result);}
 if(method==='POST'&&path==='/api/reservations'){role(user,training);const input=await body(request);const result=transaction(()=>{const cls=get('classes',reference('classes',input.classId,'Clase'));const member=get('members',reference('members',input.memberId,'Socio'));assert(memberView(member).status==='activo','El socio necesita una cuota activa para reservar');assert(cls.date>today()||(cls.date===today()&&cls.time>localTime()),'No se pueden reservar clases que ya comenzaron');assert(!member.expiresAt||member.expiresAt>=cls.date,'La cuota del socio vence antes de la clase');const reservations=all('reservations').filter(item=>item.classId===cls.id);assert(!reservations.some(item=>item.memberId===member.id),'El socio ya reservó esta clase',409);assert(reservations.length<cls.capacity,'La clase no tiene cupos disponibles',409);const saved=put('reservations',{classId:cls.id,memberId:member.id});audit(user,'Reservar clase',saved.id,`${member.name} · ${cls.name}`);return saved;});return json(response,201,result);}
 if(method==='GET'&&path==='/api/export')return exportCsv(user,url,response);
 if(method==='POST'&&path==='/api/backups'){role(user,admin);audit(user,'Crear respaldo');const result=createBackup();return json(response,201,result);}
 const download=/^\/api\/backups\/([^/]+)$/.exec(path);
 if(method==='GET'&&download){role(user,admin);const name=decodeURIComponent(download[1]);const file=backupPath(name);assert(file,'Respaldo no encontrado',404);audit(user,'Descargar respaldo',name);response.writeHead(200,{'Content-Type':'application/vnd.sqlite3','Content-Disposition':`attachment; filename="${name}"`,'Cache-Control':'no-store'});return response.end(readFileSync(file));}
 const generic=/^\/api\/([a-z]+)(?:\/([^/]+))?$/.exec(path);
 if(generic){const collection=generic[1],id=generic[2];if(permissions[collection]&&((method==='POST'&&!id)||(method==='PUT'&&id))){role(user,permissions[collection]);const input=await body(request);const saved=transaction(()=>{const existing=id?get(collection,id):null;if(id)assert(existing,'Registro no encontrado',404);const value=entityData(collection,input,existing,user);const result=put(collection,value);if(collection==='users'&&existing&&(input.password||!result.active||result.role!==existing.role))db.prepare('DELETE FROM sessions WHERE userId=?').run(result.id);audit(user,`${id?'Actualizar':'Crear'} ${collection}`,result.id,result.name||'');return result;});return json(response,id?200:201,collection==='users'?safeUser(saved):collection==='members'?safeMember(saved,user):saved);}
  if(method==='DELETE'&&id&&['reservations','routines','classes','users'].includes(collection)){role(user,collection==='reservations'?training:permissions[collection]);const saved=transaction(()=>{const item=get(collection,id);assert(item,'Registro no encontrado',404);if(collection==='users'){const value=entityData('users',{active:false},item,user);put('users',value);db.prepare('DELETE FROM sessions WHERE userId=?').run(item.id);}else{if(collection==='classes'){for(const reservation of all('reservations').filter(value=>value.classId===id)){remove('reservations',reservation.id);audit(user,'Cancelar reserva por eliminación de clase',reservation.id);}}remove(collection,id);}audit(user,`Eliminar ${collection}`,id,item.name||'');return {ok:true};});return json(response,200,saved);}
 }
 throw new HttpError(404,'Ruta no encontrada');
}

function exportCsv(user,url,response){
 const type=url.searchParams.get('type');assert(['members','payments','movements','checkins','products','sales'].includes(type),'Tipo de exportación inválido');role(user,type==='checkins'?[...finance,'profesor']:finance);const from=dateValue(url.searchParams.get('from'),'Desde');const to=dateValue(url.searchParams.get('to'),'Hasta');assert(!from||!to||from<=to,'El período es inválido');const filtered=all(type).filter(item=>{const value=item.date||item.createdAt;const date=value.length===10?value:localDate(value);return (!from||date>=from)&&(!to||date<=to);});let headers;let rows;
 if(type==='members'){headers=['Número','Nombre','DNI','Teléfono','Email','Estado','Plan','Vencimiento'];rows=filtered.map(value=>{const item=memberView(value);return [item.number,item.name,item.dni,item.phone,item.email,item.status,item.planName,item.expiresAt];});}
 if(type==='payments'){headers=['Fecha','Socio','Plan','Importe','Medio de pago','Vencimiento'];rows=filtered.map(item=>[item.date,get('members',item.memberId)?.name,get('plans',item.planId)?.name,item.amount,item.method,item.expiresAt]);}
 if(type==='movements'){headers=['Fecha','Tipo','Categoría','Descripción','Importe','Medio de pago','Caja'];rows=filtered.map(item=>[item.date,item.type,item.category,item.description,item.amount,item.method,item.sessionId]);}
 if(type==='checkins'){headers=['Fecha','Socio','Permitido','Motivo','Método','Salida'];rows=filtered.map(item=>[item.date,get('members',item.memberId)?.name,item.allowed?'Sí':'No',item.reason,item.method,item.checkoutAt]);}
 if(type==='products'){headers=['Nombre','Categoría','Precio','Costo','Stock','Stock mínimo','Activo'];rows=filtered.map(item=>[item.name,item.category,item.price,item.cost,item.stock,item.minStock,item.active?'Sí':'No']);}
 if(type==='sales'){headers=['Fecha','Productos','Total','Medio de pago','Anulada'];rows=filtered.map(item=>[item.date,item.items.map(product=>`${product.quantity} × ${product.name}`).join(', '),item.total,item.method,item.voided?'Sí':'No']);}
 const cell=value=>{let text=String(value??'');if(/^[\s]*[=+\-@]/.test(text)||/^[\t\r\n]/.test(text))text="'"+text;return '"'+text.replaceAll('"','""')+'"';};const content='\uFEFF'+[headers,...rows].map(row=>row.map(cell).join(';')).join('\r\n');audit(user,'Exportar CSV',type,`${rows.length} registros`);response.writeHead(200,{'Content-Type':'text/csv; charset=utf-8','Content-Disposition':`attachment; filename="${type}-${today()}.csv"`,'Cache-Control':'no-store'});response.end(content);
}

const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.webp':'image/webp','.ico':'image/x-icon','.woff2':'font/woff2','.json':'application/json; charset=utf-8'};
const pages={'/':'/index.html','/admin':'/admin.html','/socios':'/socios.html'};
const fileCache=new Map();
function readStatic(file){const info=statSync(file);const cached=fileCache.get(file);if(cached&&cached.mtime===info.mtimeMs)return cached.buf;const buf=readFileSync(file);fileCache.set(file,{mtime:info.mtimeMs,buf});return buf;}
const server=http.createServer(async(request,response)=>{
 response.setHeader('X-Content-Type-Options','nosniff');response.setHeader('X-Frame-Options','DENY');response.setHeader('Referrer-Policy','same-origin');response.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'");
 try{const host=request.headers.host||'';if(['127.0.0.1','localhost','::1'].includes(HOST)){let hostname='';try{hostname=new URL('http://'+host).hostname;}catch{throw new HttpError(400,'Host inválido');}assert(['127.0.0.1','localhost','[::1]'].includes(hostname),'Host no permitido',403);}const url=new URL(request.url,'http://'+(host||'localhost'));if(url.pathname.startsWith('/api/'))return await serialize(()=>api(request,response,url));assert(['GET','HEAD'].includes(request.method),'Método no permitido',405);const pathname=decodeURIComponent(url.pathname);const page=pages[pathname.replace(/\/+$/,'')||'/'];let file=resolve(publicDirectory,'.'+(page||pathname));assert(!relative(publicDirectory,file).startsWith('..')&&!relative(publicDirectory,file).includes(':'),'Ruta no permitida',403);if(!existsSync(file)&&!extname(pathname))file=join(publicDirectory,'index.html');assert(existsSync(file)&&statSync(file).isFile(),'Archivo no encontrado',404);const body=readStatic(file);response.writeHead(200,{'Content-Type':types[extname(file)]||'application/octet-stream','Cache-Control':extname(file)==='.html'?'no-cache':'public, max-age=300'});response.end(request.method==='HEAD'?undefined:body);}catch(error){if(!error.status)console.error(error);if(!response.headersSent)json(response,error.status||500,{error:error.status?error.message:'Ocurrió un error interno. Volvé a intentar.'});else response.end();}
});
server.requestTimeout=30000;
server.headersTimeout=15000;
let stopMdns=()=>{};
server.on('error',error=>{
 if(error.code==='EADDRINUSE'){
  console.error(`El puerto ${PORT} ya está en uso. Anversol puede estar abierto en otra ventana.`);
  console.error('Cerrá esa ventana o usá el sistema que ya está corriendo. No hace falta abrir iniciar-gym-red.cmd de nuevo.');
  const ips=lanIPv4();
  if(ips.length){console.error('En el celular, misma WiFi:');for(const ip of ips)console.error(`  http://${ip}:${PORT}`);}
  process.exit(1);
 }
 console.error(error);
 process.exit(1);
});
server.listen(PORT,HOST,()=>{
 console.log(`Anversol disponible en http://${HOST==='0.0.0.0'?'localhost':HOST}:${PORT}`);
 if(lanMode){
  const ips=lanIPv4();
  if(ips.length){
   console.log('En el celular, misma WiFi (escribí esta dirección):');
   for(const ip of ips)console.log(`  http://${ip}:${PORT}`);
  }else console.log('No se detectó una IP de red. Conectá esta PC al WiFi o al cable del gimnasio.');
  console.log(`También podés probar http://${mdnsName}${PORT===80?'':`:${PORT}`}`);
  console.log('Si el celular no entra, ejecutá permitir-red.cmd y aceptá el permiso de Windows.');
  stopMdns=advertiseMdns();
 }
 console.log(`Datos locales: ${dataDirectory}`);
 dailyBackup();
});
setInterval(dailyBackup,60*60000).unref();
setInterval(()=>{for(const [key,value]of attempts)if(Date.now()-value.since>15*60000)attempts.delete(key);},15*60000).unref();
function shutdown(){try{stopMdns();}catch{}server.close(()=>{db.close();process.exit(0);});setTimeout(()=>process.exit(0),3000).unref();}
process.on('SIGINT',shutdown);process.on('SIGTERM',shutdown);
