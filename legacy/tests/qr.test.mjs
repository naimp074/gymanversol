import assert from 'node:assert/strict';
import { test } from 'node:test';
import { qrSvg } from '../public/qr.js';

test('el QR genera un SVG distinto según el contenido', () => {
  const first = qrSvg('anversol-socio-1');
  const second = qrSvg('anversol-socio-2');
  assert.match(first, /^<svg /);
  assert.match(first, /<path /);
  assert.notEqual(first, second);
  const token = 'a'.repeat(48);
  const credential = qrSvg(token, 180);
  assert.match(credential, /width="180"/);
  assert.ok(credential.length > 800, 'El código de credencial debe tener módulos suficientes');
});
