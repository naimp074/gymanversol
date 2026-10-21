import dgram from 'node:dgram';
import { networkInterfaces } from 'node:os';

const MULTICAST = '224.0.0.251';
const MDNS_PORT = 5353;
const host = String(process.env.GYM_MDNS_NAME || 'anversol').toLowerCase().replace(/[^a-z0-9-]/g, '') || 'anversol';
export const mdnsName = `${host}.local`;
export const mdnsNames = [mdnsName, 'gym.local'];

const skipAdapter = /radmin|hamachi|zerotier|tailscale|vmware|virtualbox|hyper-v|vethernet|docker|wsl|loopback|bluetooth|vpn|virtual/i;
const privateScore = ip => {
  if (/^192\.168\./.test(ip)) return 3;
  if (/^10\./.test(ip)) return 2;
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(ip)) return 1;
  return 0;
};

export function lanIPv4() {
  const scored = [];
  const fallback = [];
  for (const [name, list] of Object.entries(networkInterfaces())) {
    const skip = skipAdapter.test(name);
    for (const item of list || []) {
      if ((item.family !== 'IPv4' && item.family !== 4) || item.internal) continue;
      const ip = item.address;
      if (/^169\.254\.|^25\.|^26\./.test(ip)) continue;
      const score = privateScore(ip);
      if (!score) continue;
      if (skip) fallback.push({ ip, score: score - 4 });
      else scored.push({ ip, score });
    }
  }
  const chosen = (scored.length ? scored : fallback).sort((a, b) => b.score - a.score);
  return [...new Set(chosen.map(item => item.ip))];
}

function encodeName(name) {
  const chunks = [];
  for (const label of name.split('.').filter(Boolean)) {
    const buf = Buffer.from(label, 'ascii');
    chunks.push(Buffer.from([buf.length]), buf);
  }
  chunks.push(Buffer.from([0]));
  return Buffer.concat(chunks);
}

function parseQueriedNames(msg) {
  const names = [];
  let offset = 12;
  const count = msg.length >= 12 ? msg.readUInt16BE(4) : 0;
  const readName = start => {
    const labels = [];
    let pos = start;
    let jumped = false;
    let end = start;
    for (let i = 0; i < 20 && pos < msg.length; i++) {
      const len = msg[pos];
      if (len === 0) {
        if (!jumped) end = pos + 1;
        break;
      }
      if ((len & 0xc0) === 0xc0) {
        if (pos + 1 >= msg.length) break;
        const ptr = ((len & 0x3f) << 8) | msg[pos + 1];
        if (!jumped) end = pos + 2;
        pos = ptr;
        jumped = true;
        continue;
      }
      labels.push(msg.subarray(pos + 1, pos + 1 + len).toString('ascii'));
      pos += 1 + len;
      if (!jumped) end = pos;
    }
    return { name: labels.join('.').toLowerCase(), next: end };
  };
  for (let i = 0; i < count && offset + 4 <= msg.length; i++) {
    const parsed = readName(offset);
    names.push(parsed.name);
    offset = parsed.next + 4;
  }
  return names;
}

function aRecord(name, ip) {
  const rr = Buffer.alloc(10 + 4);
  rr.writeUInt16BE(1, 0);
  rr.writeUInt16BE(0x8001, 2);
  rr.writeUInt32BE(120, 4);
  rr.writeUInt16BE(4, 8);
  Buffer.from(ip.split('.').map(Number)).copy(rr, 10);
  return Buffer.concat([encodeName(name), rr]);
}

function packetFor(ips) {
  const answers = [];
  for (const name of mdnsNames) for (const ip of ips) answers.push(aRecord(name, ip));
  const header = Buffer.alloc(12);
  header.writeUInt16BE(0x8400, 2);
  header.writeUInt16BE(answers.length, 6);
  return Buffer.concat([header, ...answers]);
}

export function advertiseMdns() {
  const socket = dgram.createSocket({ type: 'udp4', reuseAddr: true });
  const send = (buffer, port, address) => {
    try { socket.send(buffer, port, address); } catch { /* La IP numérica sigue funcionando si mDNS no está disponible. */ }
  };
  const announce = target => {
    const ips = lanIPv4();
    if (!ips.length) return;
    const packet = packetFor(ips);
    send(packet, MDNS_PORT, MULTICAST);
    if (target) send(packet, target.port, target.address);
  };
  socket.on('error', () => {});
  socket.on('message', (msg, rinfo) => {
    if (msg.length < 12 || msg.readUInt16BE(2) & 0x8000) return;
    const asked = parseQueriedNames(msg);
    if (!asked.some(name => mdnsNames.includes(name))) return;
    announce(rinfo);
  });
  try {
    socket.bind(MDNS_PORT, () => {
      try {
        socket.addMembership(MULTICAST);
        socket.setMulticastTTL(255);
        socket.setMulticastLoopback(true);
      } catch { /* Algunos adaptadores no aceptan multicast. */ }
      announce();
      const timer = setInterval(() => announce(), 45000);
      timer.unref();
    });
  } catch {
    return () => {};
  }
  return () => { try { socket.close(); } catch {} };
}
