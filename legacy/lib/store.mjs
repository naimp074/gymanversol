import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, readdirSync, statSync, unlinkSync, existsSync } from 'node:fs';
import { resolve, join, dirname } from 'node:path';
import { randomUUID } from 'node:crypto';

export const dataDirectory = resolve(process.env.GYM_DATA_DIR || process.env.DATA_DIR || './data');
export const backupDirectory = join(dataDirectory, 'backups');
mkdirSync(backupDirectory, { recursive: true });
export const db = new DatabaseSync(join(dataDirectory, 'gym.sqlite'));
db.exec('PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;');
db.exec(`
 CREATE TABLE IF NOT EXISTS entities (collection TEXT NOT NULL,id TEXT NOT NULL,createdAt TEXT NOT NULL,data TEXT NOT NULL,PRIMARY KEY(collection,id));
 CREATE TABLE IF NOT EXISTS sessions (token TEXT PRIMARY KEY,userId TEXT NOT NULL,expiresAt INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS member_sessions (token TEXT PRIMARY KEY,memberId TEXT NOT NULL,expiresAt INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS metadata (key TEXT PRIMARY KEY,value TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS audit (id TEXT PRIMARY KEY,date TEXT NOT NULL,userId TEXT,userName TEXT,action TEXT NOT NULL,entityId TEXT,detail TEXT);
 CREATE INDEX IF NOT EXISTS collection_created ON entities(collection,createdAt);
 CREATE INDEX IF NOT EXISTS member_checkins ON entities(collection,json_extract(data,'$.memberId'),json_extract(data,'$.date'));
 CREATE INDEX IF NOT EXISTS member_dni ON entities(collection, json_extract(data,'$.dni'));
 CREATE INDEX IF NOT EXISTS member_number ON entities(collection, json_extract(data,'$.number'));
 CREATE INDEX IF NOT EXISTS member_qr ON entities(collection, json_extract(data,'$.qrToken'));
 CREATE INDEX IF NOT EXISTS user_username ON entities(collection, json_extract(data,'$.username'));
 CREATE INDEX IF NOT EXISTS session_open ON entities(collection, json_extract(data,'$.closedAt'));
`);
const getStatement = db.prepare('SELECT data FROM entities WHERE collection=? AND id=?');
const allStatement = db.prepare('SELECT data FROM entities WHERE collection=? ORDER BY createdAt DESC,id');
const putStatement = db.prepare('INSERT INTO entities(collection,id,createdAt,data) VALUES (?,?,?,?) ON CONFLICT(collection,id) DO UPDATE SET data=excluded.data');
const memberByDni = db.prepare("SELECT data FROM entities WHERE collection='members' AND json_extract(data,'$.dni')=? LIMIT 1");
const memberByNumber = db.prepare("SELECT data FROM entities WHERE collection='members' AND json_extract(data,'$.number')=? LIMIT 1");
const memberByQr = db.prepare("SELECT data FROM entities WHERE collection='members' AND json_extract(data,'$.qrToken')=? LIMIT 1");
const userByUsername = db.prepare("SELECT data FROM entities WHERE collection='users' AND json_extract(data,'$.username')=? LIMIT 1");
const openCashStmt = db.prepare("SELECT data FROM entities WHERE collection='cashSessions' AND json_extract(data,'$.closedAt') IS NULL LIMIT 1");
const checkinsByMember = db.prepare("SELECT data FROM entities WHERE collection='checkins' AND json_extract(data,'$.memberId')=?");
const openEntryStmt = db.prepare("SELECT data FROM entities WHERE collection='checkins' AND json_extract(data,'$.memberId')=? AND json_extract(data,'$.allowed')=1 AND json_extract(data,'$.checkoutAt') IS NULL LIMIT 1");
const movementsBySession = db.prepare("SELECT data FROM entities WHERE collection='movements' AND json_extract(data,'$.sessionId')=?");
const touchSessionStmt = db.prepare('UPDATE sessions SET expiresAt=? WHERE token=?');
const parseRow = row => row ? JSON.parse(row.data) : null;
export const now = () => new Date().toISOString();
export function today() { return new Intl.DateTimeFormat('en-CA', { timeZone:'America/Argentina/Buenos_Aires',year:'numeric',month:'2-digit',day:'2-digit' }).format(new Date()); }
export function addDays(date, days) { const value = new Date(`${date}T12:00:00Z`); value.setUTCDate(value.getUTCDate()+days); return value.toISOString().slice(0,10); }
export function localDate(date) { return new Intl.DateTimeFormat('en-CA', { timeZone:'America/Argentina/Buenos_Aires',year:'numeric',month:'2-digit',day:'2-digit' }).format(new Date(date)); }
export function localTime() { return new Intl.DateTimeFormat('en-GB', { timeZone:'America/Argentina/Buenos_Aires',hour:'2-digit',minute:'2-digit',hour12:false }).format(new Date()); }
export const get = (collection,id) => parseRow(getStatement.get(collection,id));
export const all = collection => allStatement.all(collection).map(row=>JSON.parse(row.data));
export function findMember(identifier, method='manual') {
  if (method === 'qr') return parseRow(memberByQr.get(identifier));
  return parseRow(getStatement.get('members', identifier)) || parseRow(memberByDni.get(identifier)) || parseRow(memberByNumber.get(identifier));
}
export const findUserByUsername = username => parseRow(userByUsername.get(username));
export const activeCashSession = () => parseRow(openCashStmt.get());
export const memberCheckins = memberId => checkinsByMember.all(memberId).map(row=>JSON.parse(row.data));
export const openEntry = memberId => parseRow(openEntryStmt.get(memberId));
export const sessionMovements = sessionId => movementsBySession.all(sessionId).map(row=>JSON.parse(row.data));
export function touchSession(tokenHash, expiresAt) { touchSessionStmt.run(expiresAt, tokenHash); }
export function put(collection, value) { const record={...value,id:value.id||randomUUID(),createdAt:value.createdAt||now()}; putStatement.run(collection,record.id,record.createdAt,JSON.stringify(record)); return record; }
export function remove(collection,id) { db.prepare('DELETE FROM entities WHERE collection=? AND id=?').run(collection,id); }
export function transaction(callback) { db.exec('BEGIN IMMEDIATE'); try { const result=callback(); db.exec('COMMIT'); return result; } catch(error) { db.exec('ROLLBACK'); throw error; } }
export function metadata(key, fallback=null) { const row=db.prepare('SELECT value FROM metadata WHERE key=?').get(key); return row ? JSON.parse(row.value):fallback; }
export function setMetadata(key,value) { db.prepare('INSERT INTO metadata(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run(key,JSON.stringify(value)); }
export function audit(user,action,entityId='',detail='') { db.prepare('INSERT INTO audit(id,date,userId,userName,action,entityId,detail) VALUES(?,?,?,?,?,?,?)').run(randomUUID(),now(),user?.id||'',user?.name||'Sistema',action,entityId,String(detail).slice(0,1500)); }
export const auditList = () => db.prepare('SELECT * FROM audit ORDER BY date DESC LIMIT 1000').all();
export function backupList() { return readdirSync(backupDirectory).filter(name=>/^gym-\d{4}-\d{2}-\d{2}-[\w-]+\.sqlite$/.test(name)).map(name=> { const file=statSync(join(backupDirectory,name)); return {name,date:file.mtime.toISOString(),size:file.size}; }).sort((a,b)=>b.date.localeCompare(a.date)); }
export function createBackup() { const name=`gym-${today()}-${Date.now()}-${randomUUID().slice(0,8)}.sqlite`; const path=join(backupDirectory,name); db.prepare('VACUUM INTO ?').run(path); const result={name,date:now(),size:statSync(path).size}; for(const old of backupList().slice(14)) { const target=resolve(backupDirectory,old.name); if(dirname(target)!==backupDirectory) throw new Error('Ruta de respaldo inválida'); unlinkSync(target); } setMetadata('lastBackupDate',today()); return result; }
export function dailyBackup() { if(all('users').length && metadata('lastBackupDate')!==today()) { try { createBackup(); } catch(error) { console.error('No se pudo crear el respaldo automático:',error.message); } } }
export function backupPath(name) { if(!/^gym-\d{4}-\d{2}-\d{2}-[\w-]+\.sqlite$/.test(name)) return null; const path=join(backupDirectory,name); return existsSync(path)?path:null; }
const recentCheckin=db.prepare("SELECT json_extract(data,'$.date') AS date FROM entities WHERE collection='checkins' AND json_extract(data,'$.memberId')=? AND json_extract(data,'$.allowed')=1 ORDER BY json_extract(data,'$.date') DESC LIMIT 1");
export function memberView(member) { const plan=get('plans',member.planId); const daysLeft=member.expiresAt ? Math.round((Date.parse(member.expiresAt+'T12:00:00Z')-Date.parse(today()+'T12:00:00Z'))/86400000):-1; const recent=recentCheckin.get(member.id); return {...member,status:member.state==='suspendido'||member.state==='baja'?member.state:daysLeft>=0?'activo':'vencido',daysLeft,planName:plan?.name||'Sin plan',lastCheckin:recent?.date||null}; }
