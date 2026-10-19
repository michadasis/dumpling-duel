// Keyboard + mouse (pointer lock, with a cursor-aim fallback) and on-screen touch controls.
export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.keys = new Set();
    this.look = { dx: 0, dy: 0 };
    this.cursor = { x: 0, y: 0 };
    this.locked = false;
    this.cursorAim = false;
    this.enabled = false;
    this.handlers = {};
    this.touchMove = { x: 0, y: 0 };
    this.touchHeld = { brace: false, eyes: false, crouch: false };
    this.isTouch = matchMedia('(pointer: coarse)').matches;
    this.bind();
  }

  on(name, fn) { this.handlers[name] = fn; }
  fire(name, ...a) { const h = this.handlers[name]; if (h) h(...a); }

  bind() {
    const typing = () => { const t = document.activeElement; return t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA'); };
    addEventListener('keydown', (e) => {
      if (typing()) return;
      const k = e.code;
      if (this.enabled && ['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab'].includes(k)) e.preventDefault();
      if (e.repeat) return;
      this.keys.add(k);
      if (!this.enabled) return;
      if (k === 'Space') this.fire('catch');
      else if (k === 'KeyE') this.fire('pickup');
      else if (k === 'KeyH') this.fire('help');
      else if (k === 'KeyM') this.fire('mute');
      else if (k === 'KeyP' || (k === 'Escape' && !this.locked)) this.fire('pause');
    });
    addEventListener('keyup', (e) => this.keys.delete(e.code));
    addEventListener('blur', () => { this.keys.clear(); if (this.mouseDown) { this.mouseDown = false; this.fire('throwEnd'); } });

    const c = this.canvas;
    c.addEventListener('contextmenu', (e) => e.preventDefault());
    c.addEventListener('mousedown', (e) => {
      if (!this.enabled || this.isTouch) return;
      if (!this.locked && !this.cursorAim) { this.requestLock(); return; }
      if (e.button === 0) { this.mouseDown = true; this.fire('primary'); }
      else if (e.button === 2) this.fire('catch');
    });
    addEventListener('mouseup', (e) => {
      if (e.button === 0 && this.mouseDown) { this.mouseDown = false; this.fire('throwEnd'); }
    });
    addEventListener('mousemove', (e) => {
      if (this.locked) { this.look.dx += e.movementX; this.look.dy += e.movementY; }
      const r = c.getBoundingClientRect();
      this.cursor.x = ((e.clientX - r.left) / r.width) * 2 - 1;
      this.cursor.y = ((e.clientY - r.top) / r.height) * 2 - 1;
    });
    document.addEventListener('pointerlockchange', () => {
      const was = this.locked;
      this.locked = document.pointerLockElement === c;
      if (this.locked) this.everLocked = true;
      if (was && !this.locked && this.enabled) this.fire('unlocked');
      this.fire('lockchange', this.locked);
    });
    document.addEventListener('pointerlockerror', () => this.lockFailed());
  }

  requestLock() {
    if (this.isTouch) return;
    try {
      const r = this.canvas.requestPointerLock({ unadjustedMovement: false });
      if (r && r.catch) r.catch(() => this.lockFailed());
    } catch { this.lockFailed(); }
  }

  lockFailed() {
    // Right after Esc, browsers refuse to re-lock for a moment. Only fall back to cursor aim
    // if locking has never worked here (for example inside a sandboxed frame).
    if (this.everLocked) this.fire('lockfail');
    else this.useCursorAim();
  }

  useCursorAim() {
    if (this.cursorAim) return;
    this.cursorAim = true;
    this.fire('cursorAim');
  }

  exitLock() { if (document.pointerLockElement) document.exitPointerLock(); }

  consumeLook() { const l = { dx: this.look.dx, dy: this.look.dy }; this.look.dx = 0; this.look.dy = 0; return l; }

  moveVector() {
    const k = this.keys;
    let x = 0, y = 0;
    if (k.has('KeyW') || k.has('ArrowUp')) y += 1;
    if (k.has('KeyS') || k.has('ArrowDown')) y -= 1;
    if (k.has('KeyA') || k.has('ArrowLeft')) x -= 1;
    if (k.has('KeyD') || k.has('ArrowRight')) x += 1;
    x += this.touchMove.x; y += this.touchMove.y;
    const len = Math.hypot(x, y);
    if (len > 1) { x /= len; y /= len; }
    return { x, y };
  }

  held(name) {
    const k = this.keys;
    if (name === 'brace') return k.has('KeyF') || k.has('ShiftLeft') || k.has('ShiftRight') || this.touchHeld.brace;
    if (name === 'eyes') return k.has('KeyQ') || this.touchHeld.eyes;
    if (name === 'crouch') return k.has('KeyC') || k.has('ControlLeft') || this.touchHeld.crouch;
    return false;
  }

  // ---------- touch ----------
  bindTouch(root) {
    this.touchRoot = root;
    const joy = root.querySelector('#t-joy'), knob = root.querySelector('#t-knob'), pad = root.querySelector('#t-look');
    const trackLook = new Map();
    let joyId = null, joyO = null;
    const lookScale = 0.9;
    const startJoy = (e) => {
      if (joyId !== null) return;
      joyId = e.pointerId; joyO = { x: e.clientX, y: e.clientY };
      joy.classList.add('on'); joy.style.left = e.clientX + 'px'; joy.style.top = e.clientY + 'px';
      knob.style.transform = 'translate(-50%,-50%)';
    };
    root.querySelector('#t-move').addEventListener('pointerdown', (e) => { e.preventDefault(); startJoy(e); });
    pad.addEventListener('pointerdown', (e) => { e.preventDefault(); trackLook.set(e.pointerId, { x: e.clientX, y: e.clientY }); });
    const btn = (id, down, up) => {
      const el = root.querySelector(id);
      el.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); el.classList.add('down'); trackLook.set(e.pointerId, { x: e.clientX, y: e.clientY, btn: true }); down && down(); });
      const end = (e) => { el.classList.remove('down'); trackLook.delete(e.pointerId); up && up(); };
      el.addEventListener('pointerup', end); el.addEventListener('pointercancel', end); el.addEventListener('lostpointercapture', end);
      el.addEventListener('pointerdown', (e) => { try { el.setPointerCapture(e.pointerId); } catch { /* ignore */ } });
    };
    btn('#t-throw', () => this.fire('primary'), () => this.fire('throwEnd'));
    btn('#t-catch', () => this.fire('catch'));
    btn('#t-pick', () => this.fire('pickup'));
    btn('#t-duck', () => (this.touchHeld.crouch = true), () => (this.touchHeld.crouch = false));
    btn('#t-brace', () => (this.touchHeld.brace = true), () => (this.touchHeld.brace = false));
    btn('#t-eyes', () => (this.touchHeld.eyes = true), () => (this.touchHeld.eyes = false));
    btn('#t-pause', () => this.fire('pause'));
    addEventListener('pointermove', (e) => {
      if (e.pointerId === joyId) {
        const dx = e.clientX - joyO.x, dy = e.clientY - joyO.y, r = 52;
        const len = Math.hypot(dx, dy), k = len > r ? r / len : 1;
        knob.style.transform = `translate(calc(-50% + ${dx * k}px), calc(-50% + ${dy * k}px))`;
        this.touchMove.x = (dx * k) / r; this.touchMove.y = -(dy * k) / r;
        return;
      }
      const t = trackLook.get(e.pointerId);
      if (t) {
        this.look.dx += (e.clientX - t.x) * lookScale * 2.2;
        this.look.dy += (e.clientY - t.y) * lookScale * 2.2;
        t.x = e.clientX; t.y = e.clientY;
      }
    }, { passive: true });
    const endAll = (e) => {
      if (e.pointerId === joyId) { joyId = null; this.touchMove.x = 0; this.touchMove.y = 0; joy.classList.remove('on'); }
      const t = trackLook.get(e.pointerId);
      if (t && !t.btn) trackLook.delete(e.pointerId);
    };
    addEventListener('pointerup', endAll); addEventListener('pointercancel', endAll);
    addEventListener('pointerdown', (e) => { if (e.pointerType === 'touch' && !this.isTouch) { this.isTouch = true; this.fire('touchDetected'); } }, { capture: true });
  }
}
