import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { spawn } from 'node:child_process';
import { mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname, resolve, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'node:net';
import { once } from 'node:events';
import { DatabaseSync } from 'node:sqlite';

const project = dirname(dirname(fileURLToPath(import.meta.url)));
let dataDir, server, baseUrl, serverOutput = '', ownerCookie = '';
let today, plan, member, otherMember, receiver, teacherUser, accountant;
const password = 'PruebaGym2026!';

const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
async function cleanupTemp(directory, prefix) {
  const target = resolve(directory);
  assert.equal(dirname(target), resolve(tmpdir()), 'La limpieza solo puede operar en el directorio temporal');
  assert.ok(basename(target).startsWith(prefix), 'Solo se eliminan carpetas creadas por esta prueba');
  await rm(target, { recursive: true, force: true });
}
const addDays = (date, days) => {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
};

async function freePort() {
  const listener = createServer();
  listener.listen(0, '127.0.0.1');
  await once(listener, 'listening');
  const port = listener.address().port;
  await new Promise(resolve => listener.close(resolve));
  return port;
}

async function startServer() {
  const port = await freePort();
  baseUrl = `http://127.0.0.1:${port}`;
  serverOutput = '';
  server = spawn(process.execPath, ['server.mjs'], {
    cwd: project,
    env: { ...process.env, HOST: '127.0.0.1', PORT: String(port), GYM_DATA_DIR: dataDir, DATA_DIR: dataDir, NODE_ENV: 'test' },
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true
  });
  server.stdout.on('data', value => { serverOutput += value; });
  server.stderr.on('data', value => { serverOutput += value; });
  for (let attempt = 0; attempt < 150; attempt++) {
    if (server.exitCode !== null) throw new Error(`El servidor terminó antes de iniciar:\n${serverOutput}`);
    try {
      const response = await fetch(`${baseUrl}/api/session`);
      if (response.ok) return;
    } catch { /* Wait for the child process to bind its port. */ }
    await pause(100);
  }
  throw new Error(`El servidor no respondió:\n${serverOutput}`);
}

async function stopServer() {
  if (!server || server.exitCode !== null) return;
  const stopped = once(server, 'exit');
  server.kill();
  await stopped;
}

async function request(path, { method = 'GET', body, cookie = ownerCookie, origin = baseUrl } = {}) {
  const headers = { Origin: origin };
  if (cookie) headers.Cookie = cookie;
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const response = await fetch(`${baseUrl}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  const raw = await response.text();
  let value;
  try { value = raw ? JSON.parse(raw) : null; } catch { value = raw; }
  return { status: response.status, ok: response.ok, headers: response.headers, value, raw };
}

async function success(path, options) {
  const response = await request(path, options);
  assert.ok(response.ok, `${options?.method || 'GET'} ${path}: ${response.status} ${response.raw}`);
  return response.value;
}

async function rejected(path, options, expectedStatus) {
  const response = await request(path, options);
  assert.ok(!response.ok, `Se esperaba rechazar ${options?.method || 'GET'} ${path}, se recibió ${response.raw}`);
  if (expectedStatus) assert.equal(response.status, expectedStatus, response.raw);
  assert.equal(typeof response.value.error, 'string', response.raw);
  return response;
}

async function login(username) {
  const result = await request('/api/login', { method: 'POST', body: { username, password }, cookie: '' });
  assert.ok(result.ok, result.raw);
  const cookie = result.headers.get('set-cookie');
  assert.ok(cookie?.includes('HttpOnly'), 'La sesión debe ser HttpOnly');
  assert.match(cookie, /SameSite=Strict/i);
  return cookie.split(';')[0];
}

async function createMember(dni, overrides = {}) {
  return success('/api/members', { method: 'POST', body: { name: `Socio ${dni}`, dni, state: 'activo', planId: plan.id, ...overrides } });
}

async function checkin(identifier, overrides = {}) {
  return request('/api/checkins', { method: 'POST', body: { identifier, method: 'manual', override: false, ...overrides } });
}

function deniedAdmission(result) {
  assert.ok(!result.ok || result.value.allowed === false, `El ingreso debía rechazarse: ${result.raw}`);
}

describe('Anversol: flujos completos contra una base temporal', { concurrency: false }, () => {
  before(async () => {
    dataDir = await mkdtemp(join(tmpdir(), 'anversol-integration-'));
    await startServer();
  });

  after(async () => {
    await stopServer();
    if (dataDir) await cleanupTemp(dataDir, 'anversol-integration-');
  });

  test('primera instalación, autenticación y protección de origen', async () => {
    const session = await success('/api/session', { cookie: '' });
    assert.equal(session.user, null);
    assert.equal(session.needsSetup, true);
    assert.equal(typeof session.access?.url, 'string');
    await rejected('/api/bootstrap', { cookie: '' }, 401);
    await rejected('/api/setup', { method: 'POST', body: { name: 'Dueño', username: 'owner', password: '123', demo: false }, cookie: '' });
    const setup = await request('/api/setup', { method: 'POST', body: { name: 'Dueño', username: 'owner', password, demo: false }, cookie: '' });
    assert.ok(setup.ok, setup.raw);
    assert.equal(setup.value.user.role, 'dueno');
    ownerCookie = await login('owner');
    await rejected('/api/setup', { method: 'POST', body: { name: 'Otro', username: 'otro', password, demo: false } });
    await rejected('/api/login', { method: 'POST', body: { username: 'owner', password: 'equivocada' }, cookie: '' }, 401);
    await rejected('/api/login', { method: 'POST', body: { username: 'owner', password }, cookie: '', origin: 'https://sitio-ajeno.example' }, 403);
    const data = await success('/api/bootstrap');
    today = data.today;
    assert.match(today, /^\d{4}-\d{2}-\d{2}$/);
    assert.equal(data.members.length, 0, 'La instalación sin demostración no crea socios');
    assert.ok(!JSON.stringify(data).includes('passwordHash'), 'No se exponen hashes');
    await rejected(`/api/users/${setup.value.user.id}`, { method: 'PUT', body: { ...setup.value.user, active: false } });
    await rejected(`/api/users/${setup.value.user.id}`, { method: 'PUT', body: { ...setup.value.user, role: 'recepcionista', active: true } });
  });

  test('altas validadas, DNI único y una membresía sin pagar queda vencida', async () => {
    plan = await success('/api/plans', { method: 'POST', body: { name: 'Mensual de prueba', price: 10000, duration: 30, accessLimit: 0, startTime: '00:00', endTime: '23:59', discount: 0, active: true } });
    await rejected('/api/plans', { method: 'POST', body: { name: 'Inválido', price: -1, duration: 0 } });
    member = await createMember('30111222');
    otherMember = await createMember('30333444');
    const data = await success('/api/bootstrap');
    assert.equal(data.members.find(item => item.id === member.id).status, 'vencido');
    assert.ok(member.number, 'Se asigna número de socio');
    assert.ok(member.qrToken, 'Se asigna identificador QR');
    assert.notEqual(member.qrToken, otherMember.qrToken);
    await rejected('/api/members', { method: 'POST', body: { name: 'Duplicado', dni: member.dni } });
  });

  test('permisos se aplican en servidor y los profesores no ven finanzas ni certificados', async () => {
    for (const [username, role] of [['recepcion', 'recepcionista'], ['profe', 'profesor'], ['contador', 'contador']]) {
      await success('/api/users', { method: 'POST', body: { name: username, username, role, password, active: true } });
    }
    receiver = await login('recepcion');
    teacherUser = await login('profe');
    accountant = await login('contador');
    await rejected('/api/settings', { method: 'PUT', body: { gymName: 'Cambio no autorizado' }, cookie: receiver }, 403);
    await rejected('/api/users', { method: 'POST', body: { name: 'Intruso', username: 'intruso', role: 'dueno', password }, cookie: receiver }, 403);
    await rejected(`/api/plans/${plan.id}`, { method: 'PUT', body: { ...plan, price: 1 }, cookie: receiver }, 403);
    await rejected('/api/payments', { method: 'POST', body: { memberId: member.id, planId: plan.id, method: 'Efectivo' }, cookie: teacherUser }, 403);
    await rejected('/api/export?type=payments', { cookie: teacherUser }, 403);
    await success('/api/teachers', { method: 'POST', body: { name: 'Profesor prueba', salary: 123456, specialty: 'Fuerza', state: 'activo' } });
    const image = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jK1sAAAAASUVORK5CYII=';
    await success(`/api/members/${member.id}`, { method: 'PUT', body: { ...member, medicalFile: image, medicalFileName: 'certificado.png' } });
    const restricted = await success('/api/bootstrap', { cookie: teacherUser });
    for (const collection of ['payments', 'movements', 'cashSessions', 'users', 'audit', 'backups']) assert.equal(restricted[collection]?.length || 0, 0, collection);
    assert.ok(restricted.teachers.every(item => !item.salary), 'No se comparte sueldo con profesores');
    assert.ok(restricted.members.every(item => !item.medicalFile), 'No se comparten certificados con profesores');
  });

  test('caja requerida y renovación calcula precio y vencimiento en el servidor', async () => {
    const paymentBody = { memberId: member.id, planId: plan.id, method: 'Efectivo', discount: 0, amount: 1 };
    await rejected('/api/payments', { method: 'POST', body: paymentBody });
    await rejected('/api/movements', { method: 'POST', body: { type: 'ingreso', category: 'Otro', description: 'Sin apertura', amount: 500, method: 'Efectivo' } });
    await success('/api/cash/open', { method: 'POST', body: { openingAmount: 1000 }, cookie: receiver });
    await rejected('/api/cash/open', { method: 'POST', body: { openingAmount: 0 } });
    const first = await success('/api/payments', { method: 'POST', body: paymentBody, cookie: receiver });
    assert.equal(first.payment.amount, 10000, 'El importe enviado por el cliente se ignora');
    assert.equal(first.member.expiresAt, addDays(today, 30));
    const second = await success('/api/payments', { method: 'POST', body: { ...paymentBody, method: 'Transferencia' } });
    assert.equal(second.member.expiresAt, addDays(today, 60), 'Renovar no descarta días ya pagados');
    await rejected('/api/payments', { method: 'POST', body: { ...paymentBody, discount: 10 }, cookie: receiver }, 403);
    await success('/api/payments', { method: 'POST', body: { memberId: otherMember.id, planId: plan.id, method: 'Transferencia' } });
    const data = await success('/api/bootstrap');
    assert.equal(data.members.find(item => item.id === member.id).status, 'activo');
    assert.equal(data.payments.length, 3);
    assert.equal(data.movements.filter(item => item.amount === 10000).length, 3, 'Cada pago produce un movimiento');
  });

  test('accesos: vencimiento, suspensión, QR, salida, duplicados y apto físico', async () => {
    const expired = await createMember('30999000');
    const denied = await checkin(expired.dni);
    deniedAdmission(denied);
    assert.equal(denied.value.allowed, false, 'Se registra el intento rechazado');
    const admitted = await checkin(member.dni);
    assert.ok(admitted.ok, admitted.raw);
    assert.equal(admitted.value.allowed, true);
    deniedAdmission(await checkin(member.dni));
    let data = await success('/api/bootstrap');
    assert.equal(data.checkins.filter(item => item.memberId === member.id && item.allowed && !item.checkoutAt).length, 1);
    await success(`/api/checkins/${admitted.value.checkin.id}/checkout`, { method: 'POST', body: {} });
    const qr = await checkin(member.qrToken, { method: 'qr' });
    assert.equal(qr.value.allowed, true, qr.raw);
    await success(`/api/checkins/${qr.value.checkin.id}/checkout`, { method: 'POST', body: {} });
    const suspended = await createMember('30999111', { state: 'suspendido', expiresAt: addDays(today, 30) });
    deniedAdmission(await checkin(suspended.dni, { override: true }));
    await success('/api/settings', { method: 'PUT', body: { requireMedical: true } });
    deniedAdmission(await checkin(otherMember.dni));
    const existing = (await success('/api/bootstrap')).members.find(item => item.id === otherMember.id);
    await success(`/api/members/${otherMember.id}`, { method: 'PUT', body: { ...existing, medicalExpiresAt: addDays(today, 30) } });
    const medicallyAllowed = await checkin(otherMember.dni);
    assert.equal(medicallyAllowed.value.allowed, true, medicallyAllowed.raw);
    await success(`/api/checkins/${medicallyAllowed.value.checkin.id}/checkout`, { method: 'POST', body: {} });
    await success('/api/settings', { method: 'PUT', body: { requireMedical: false } });
    data = await success('/api/bootstrap');
    assert.ok(data.checkins.some(item => item.memberId === expired.id && item.allowed === false));
  });

  test('venta atómica, precios confiables, anulaciones con compensación y permisos', async () => {
    const water = await success('/api/products', { method: 'POST', body: { name: 'Agua', price: 1500, cost: 700, stock: 4, minStock: 1, active: true } });
    const snack = await success('/api/products', { method: 'POST', body: { name: 'Barra', price: 2500, cost: 1000, stock: 1, minStock: 1, active: true } });
    const beforeSale = await success('/api/bootstrap');
    await rejected('/api/sales', { method: 'POST', body: { items: [{ productId: water.id, quantity: 2 }, { productId: snack.id, quantity: 2 }], method: 'Efectivo' }, cookie: receiver });
    let data = await success('/api/bootstrap');
    assert.equal(data.products.find(item => item.id === water.id).stock, 4, 'La venta fallida no resta stock de otros ítems');
    assert.equal(data.sales.length, beforeSale.sales.length);
    assert.equal(data.movements.length, beforeSale.movements.length);
    await rejected('/api/sales', { method: 'POST', body: { items: [{ productId: water.id, quantity: 3 }, { productId: water.id, quantity: 3 }], method: 'Efectivo' } });
    const result = await success('/api/sales', { method: 'POST', body: { items: [{ productId: water.id, quantity: 2, price: 1 }], method: 'Efectivo', total: 2 }, cookie: receiver });
    const sale = result.sale || result;
    assert.equal(sale.total, 3000);
    data = await success('/api/bootstrap');
    assert.equal(data.products.find(item => item.id === water.id).stock, 2);
    await rejected(`/api/sales/${sale.id}/void`, { method: 'POST', body: { reason: 'No autorizado' }, cookie: receiver }, 403);
    await success(`/api/sales/${sale.id}/void`, { method: 'POST', body: { reason: 'Corrección de venta de prueba' } });
    await rejected(`/api/sales/${sale.id}/void`, { method: 'POST', body: { reason: 'Doble anulación' } });
    data = await success('/api/bootstrap');
    assert.equal(data.products.find(item => item.id === water.id).stock, 4);
    assert.ok(data.sales.find(item => item.id === sale.id).voided, 'La venta original queda en historial');
    await rejected(`/api/movements/${data.movements[0].id}`, { method: 'DELETE' });
  });

  test('restricciones de accesos por plan y autorización explícita de cuotas vencidas', async () => {
    const limitedPlan = await success('/api/plans', { method: 'POST', body: { name: 'Pase único', price: 1000, duration: 30, accessLimit: 1, startTime: '00:00', endTime: '23:59', discount: 0, active: true } });
    const limitedMember = await createMember('30999444', { planId: limitedPlan.id, expiresAt: addDays(today, 30) });
    const first = await checkin(limitedMember.dni);
    assert.equal(first.value.allowed, true, first.raw);
    await success(`/api/checkins/${first.value.checkin.id}/checkout`, { method: 'POST', body: {} });
    deniedAdmission(await checkin(limitedMember.dni));
    const currentHour = Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'America/Argentina/Buenos_Aires', hour: '2-digit', hourCycle: 'h23' }).format(new Date()));
    const startTime = currentHour === 23 ? '00:00' : '23:58';
    const endTime = currentHour === 23 ? '00:01' : '23:59';
    const restrictedPlan = await success('/api/plans', { method: 'POST', body: { name: 'Franja restringida', price: 1000, duration: 30, accessLimit: 0, startTime, endTime, discount: 0, active: true } });
    const restrictedMember = await createMember('30999555', { planId: restrictedPlan.id, expiresAt: addDays(today, 30) });
    deniedAdmission(await checkin(restrictedMember.dni));
    const expired = await createMember('30999666');
    await success('/api/settings', { method: 'PUT', body: { allowExpiredOverride: false, allowExpiredEntry: false } });
    deniedAdmission(await checkin(expired.dni, { override: true }));
    await success('/api/settings', { method: 'PUT', body: { allowExpiredOverride: true } });
    const approved = await request('/api/checkins', { method: 'POST', body: { identifier: expired.dni, method: 'manual', override: true }, cookie: receiver });
    assert.equal(approved.value.allowed, true, approved.raw);
    await success(`/api/checkins/${approved.value.checkin.id}/checkout`, { method: 'POST', body: {} });
    await success('/api/settings', { method: 'PUT', body: { allowExpiredOverride: false } });
  });

  test('reservas respetan cupo, membresía y unicidad', async () => {
    const teacher = (await success('/api/bootstrap')).teachers[0];
    const lesson = await success('/api/classes', { method: 'POST', body: { name: 'Funcional', teacherId: teacher.id, date: addDays(today, 1), time: '19:00', duration: 60, capacity: 1 } });
    const expired = await createMember('30999222');
    await rejected('/api/reservations', { method: 'POST', body: { classId: lesson.id, memberId: expired.id } });
    const reservation = await success('/api/reservations', { method: 'POST', body: { classId: lesson.id, memberId: member.id } });
    await rejected('/api/reservations', { method: 'POST', body: { classId: lesson.id, memberId: member.id } });
    await rejected('/api/reservations', { method: 'POST', body: { classId: lesson.id, memberId: otherMember.id } });
    await success(`/api/reservations/${reservation.id}`, { method: 'DELETE' });
    await success('/api/reservations', { method: 'POST', body: { classId: lesson.id, memberId: otherMember.id } });
  });

  test('sitio público y portal de socios por DNI sin exponer datos privados', async () => {
    for (const [path, marker] of [['/', 'data-plans'], ['/admin', '/app.js'], ['/socios', '/socios.js']]) {
      const page = await fetch(`${baseUrl}${path}`);
      assert.ok(page.ok, path);
      assert.ok((await page.text()).includes(marker), `${path} sirve la página correcta`);
    }
    await success('/api/settings', { method: 'PUT', body: { whatsapp: '5491100000000', hours: 'Lunes a viernes 7 a 23' } });
    await rejected('/api/settings', { method: 'PUT', body: { email: 'no-es-email' } });
    const info = await success('/api/public', { cookie: '' });
    assert.ok(info.plans.some(item => item.id === plan.id));
    assert.equal(info.whatsapp, '5491100000000');
    assert.ok(info.classes.length > 0, 'Se publican las próximas clases');
    assert.ok(info.teachers.length > 0);
    const publicRaw = JSON.stringify(info);
    for (const secret of ['salary', member.dni, 'qrToken', 'passwordHash']) assert.ok(!publicRaw.includes(secret), `El sitio no expone ${secret}`);
    await rejected('/api/member', { cookie: '' }, 401);
    await rejected('/api/member/login', { method: 'POST', body: { dni: '99999999' }, cookie: '' }, 404);
    await rejected('/api/member/login', { method: 'POST', body: { dni: otherMember.dni }, cookie: '', origin: 'https://sitio-ajeno.example' }, 403);
    const login = await request('/api/member/login', { method: 'POST', body: { dni: otherMember.dni }, cookie: '' });
    assert.ok(login.ok, login.raw);
    const setCookie = login.headers.get('set-cookie');
    assert.match(setCookie, /HttpOnly/);
    const memberCookie = setCookie.split(';')[0];
    assert.match(memberCookie, /^gym_member=/);
    assert.equal(login.value.member.name, otherMember.name);
    assert.ok(login.value.visits.length >= 1, 'Incluye los ingresos permitidos');
    assert.equal(login.value.reservations.length, 1, 'Incluye la clase reservada');
    const portalRaw = JSON.stringify(login.value);
    for (const secret of ['"dni"', 'qrToken', 'medicalExpiresAt', 'emergencyPhone', 'passwordHash']) assert.ok(!portalRaw.includes(secret), `El portal no expone ${secret}`);
    await rejected('/api/bootstrap', { cookie: memberCookie }, 401);
    assert.equal((await success('/api/member', { cookie: memberCookie })).member.number, otherMember.number);
    await success('/api/member/logout', { method: 'POST', body: {}, cookie: memberCookie });
    await rejected('/api/member', { cookie: memberCookie }, 401);
  });

  test('cierre de caja concilia solo efectivo y bloquea operaciones posteriores', async () => {
    await success('/api/movements', { method: 'POST', body: { type: 'gasto', category: 'Limpieza', description: 'Compra de insumos', amount: 500, method: 'Efectivo' } });
    await success('/api/movements', { method: 'POST', body: { type: 'ingreso', category: 'Otros', description: 'Ingreso bancario', amount: 777, method: 'Transferencia' } });
    await rejected('/api/movements', { method: 'POST', body: { type: 'gasto', category: 'Otros', amount: -10, method: 'Efectivo' } });
    const data = await success('/api/bootstrap');
    const session = data.cashSessions.find(item => !item.closedAt);
    const expected = session.openingAmount + data.movements.filter(item => item.sessionId === session.id && item.method === 'Efectivo').reduce((sum, item) => sum + (item.type === 'ingreso' ? item.amount : -item.amount), 0);
    assert.equal(expected, 10500, '1000 apertura + 10000 cuota - 500 gasto; venta anulada se compensa');
    const result = await success('/api/cash/close', { method: 'POST', body: { countedAmount: expected - 50, notes: 'Prueba de diferencia' }, cookie: accountant });
    const closed = result.cashSession || result.session || result;
    assert.equal(closed.expectedAmount, expected);
    assert.equal(closed.difference, -50);
    await rejected('/api/payments', { method: 'POST', body: { memberId: member.id, planId: plan.id, method: 'Efectivo' } });
  });

  test('auditoría, exportación CSV segura y copia descargable SQLite', async () => {
    await createMember('30999333', { name: '=HYPERLINK("malicioso")' });
    const csv = await request('/api/export?type=members');
    assert.ok(csv.ok, csv.raw);
    assert.match(csv.headers.get('content-type'), /csv/i);
    assert.ok(csv.raw.includes(';'));
    assert.ok(!csv.raw.split(/\r?\n/).some(line => /(?:^|;)"?=HYPERLINK/.test(line)), 'Las celdas con fórmulas se neutralizan');
    const backupResult = await success('/api/backups', { method: 'POST', body: {} });
    const data = await success('/api/bootstrap');
    assert.ok(data.audit.length > 10, 'Las modificaciones generan auditoría');
    assert.ok(!JSON.stringify(data.audit).includes(password), 'La auditoría no guarda contraseñas');
    assert.ok(data.backups.length > 0);
    const backup = backupResult.backup || backupResult;
    const filename = backup.name || data.backups[0].name;
    const response = await fetch(`${baseUrl}/api/backups/${encodeURIComponent(filename)}`, { headers: { Cookie: ownerCookie } });
    assert.ok(response.ok);
    const bytes = Buffer.from(await response.arrayBuffer());
    assert.equal(bytes.subarray(0, 16).toString(), 'SQLite format 3\0');
    const inspectionDir = await mkdtemp(join(tmpdir(), 'anversol-backup-check-'));
    try {
      const backupPath = join(inspectionDir, 'backup.sqlite');
      await writeFile(backupPath, bytes);
      const backupDatabase = new DatabaseSync(backupPath, { readOnly: true });
      try {
        assert.equal(backupDatabase.prepare('PRAGMA integrity_check').get().integrity_check, 'ok');
        assert.ok(backupDatabase.prepare("SELECT COUNT(*) AS count FROM sqlite_master WHERE type = 'table'").get().count > 0);
      } finally {
        backupDatabase.close();
      }
    } finally {
      await cleanupTemp(inspectionDir, 'anversol-backup-check-');
    }
    await rejected('/api/backups', { method: 'POST', body: {}, cookie: receiver }, 403);
    await rejected(`/api/backups/${encodeURIComponent('../server.mjs')}`);
    const health = await success('/api/health', { cookie: '' });
    assert.equal(health.ok, true);
    const styles = await fetch(`${baseUrl}/styles.css`);
    assert.ok(styles.ok, 'Debe existir la hoja de estilos');
    assert.match(await styles.text(), /--coral/);
    const qrScript = await fetch(`${baseUrl}/qr.js`);
    assert.ok(qrScript.ok, 'Debe existir el generador de QR');
    await rejected('/api/password', { method: 'POST', body: { currentPassword: 'incorrecta', newPassword: password } }, 401);
    await success('/api/password', { method: 'POST', body: { currentPassword: password, newPassword: password } });
    ownerCookie = await login('owner');
  });

  test('datos y usuarios sobreviven al reinicio; cerrar sesión revoca acceso', async () => {
    const beforeRestart = await success('/api/bootstrap');
    assert.ok((await readdir(dataDir)).length > 0, 'La base está en el directorio temporal');
    await stopServer();
    await startServer();
    assert.equal((await success('/api/session', { cookie: '' })).needsSetup, false);
    ownerCookie = await login('owner');
    const data = await success('/api/bootstrap');
    assert.equal(data.members.length, beforeRestart.members.length);
    assert.equal(data.payments.length, beforeRestart.payments.length);
    assert.equal(data.sales.length, beforeRestart.sales.length);
    assert.equal(data.members.find(item => item.id === member.id).expiresAt, addDays(today, 60));
    const originalCookie = ownerCookie;
    await success('/api/logout', { method: 'POST', body: {} });
    await rejected('/api/bootstrap', { cookie: originalCookie }, 401);
  });
});
