// Peer-to-peer link between the two players. PeerJS's free cloud server only does the handshake;
// gameplay data flows directly between the browsers over WebRTC, so the site can stay fully static on Vercel.
import Peer from 'peerjs';
import { NET } from './config.js';

class Link {
  constructor() { this.handlers = new Set(); this.onClose = null; this.open = false; }
  on(fn) { this.handlers.add(fn); return () => this.handlers.delete(fn); }
  emit(msg) { for (const h of this.handlers) h(msg); }
}

export class PeerLink extends Link {
  // role 'host' waits for one guest on the room code; 'guest' connects to it.
  static host(code, { onGuest, onError } = {}) {
    const link = new PeerLink();
    return new Promise((resolve, reject) => {
      const peer = new Peer(NET.prefix + code, { config: { iceServers: NET.iceServers }, debug: 0 });
      link.peer = peer;
      let settled = false;
      peer.on('open', () => { settled = true; resolve(link); });
      peer.on('connection', (conn) => {
        if (link.conn && link.conn.open) {
          conn.on('open', () => { conn.send({ t: 'full' }); setTimeout(() => conn.close(), 400); });
          return;
        }
        link.attach(conn, () => onGuest && onGuest());
      });
      peer.on('error', (err) => {
        if (!settled) { settled = true; reject(err); return; }
        if (err.type === 'network' || err.type === 'server-error') onError && onError(err);
      });
      peer.on('disconnected', () => { if (!link.closed) try { peer.reconnect(); } catch { /* ignore */ } });
    });
  }

  static join(code) {
    const link = new PeerLink();
    return new Promise((resolve, reject) => {
      const peer = new Peer(undefined, { config: { iceServers: NET.iceServers }, debug: 0 });
      link.peer = peer;
      const timer = setTimeout(() => reject(Object.assign(new Error('timeout'), { type: 'timeout' })), 15000);
      peer.on('open', () => {
        const conn = peer.connect(NET.prefix + code, { reliable: true, serialization: 'json' });
        link.attach(conn, () => { clearTimeout(timer); resolve(link); });
      });
      peer.on('error', (err) => { clearTimeout(timer); reject(err); });
    });
  }

  attach(conn, onOpen) {
    this.conn = conn;
    conn.on('open', () => { this.open = true; onOpen && onOpen(); });
    conn.on('data', (msg) => this.emit(msg));
    conn.on('close', () => { this.open = false; if (!this.closed && this.onClose) this.onClose(); });
    conn.on('error', () => { /* surfaced as close */ });
  }

  send(msg) { if (this.conn && this.open) { try { this.conn.send(msg); } catch { /* channel closing */ } } }

  close() {
    this.closed = true; this.open = false;
    try { this.conn && this.conn.close(); } catch { /* ignore */ }
    try { this.peer && this.peer.destroy(); } catch { /* ignore */ }
  }
}

// Same-browser link between two tabs, used for local testing (?net=tabs).
export class TabLink extends Link {
  static host(code, { onGuest } = {}) {
    const link = new TabLink();
    link.ch = new BroadcastChannel('dumpling-duel-' + code);
    link.role = 'host';
    link.ch.onmessage = (ev) => {
      const { from, msg } = ev.data;
      if (from === 'host') return;
      if (!link.open) { link.open = true; onGuest && onGuest(); }
      link.emit(msg);
    };
    return Promise.resolve(link);
  }

  static join(code) {
    const link = new TabLink();
    link.ch = new BroadcastChannel('dumpling-duel-' + code);
    link.role = 'guest';
    link.ch.onmessage = (ev) => { const { from, msg } = ev.data; if (from === 'guest') return; link.emit(msg); };
    link.open = true;
    return Promise.resolve(link);
  }

  send(msg) {
    if (!this.ch) return;
    const data = { from: this.role, msg: JSON.parse(JSON.stringify(msg)) };
    const lag = +(new URLSearchParams(location.search).get('lag') || 0); // simulated round-trip ms for testing
    if (lag > 0) setTimeout(() => this.ch && this.ch.postMessage(data), lag / 2 + Math.random() * 10);
    else this.ch.postMessage(data);
  }
  close() { this.closed = true; try { this.send({ t: 'bye' }); this.ch.close(); } catch { /* ignore */ } }
}

export function describeNetError(err) {
  const t = err && err.type;
  if (t === 'peer-unavailable') return 'No room with that code. Check the code and try again.';
  if (t === 'unavailable-id') return 'That room code is taken. Try creating the room again.';
  if (t === 'network' || t === 'server-error' || t === 'socket-error' || t === 'socket-closed') return 'Could not reach the matchmaking server. Check your connection and try again.';
  if (t === 'browser-incompatible') return 'This browser does not support peer-to-peer connections.';
  if (t === 'timeout') return 'The connection timed out. Ask the host to keep the room open and try again.';
  return 'Connection failed' + (t ? ` (${t})` : '') + '. Try again.';
}
