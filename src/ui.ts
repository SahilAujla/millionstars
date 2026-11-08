// UI layer for A Million Stars.
// The engine (main.ts) installs `window.stars` and dispatches `stars:*` events on window.
// Everything here lives inside `#ui`, which is pointer-events:none so canvas dragging keeps working.

import type { StarsAPI, ShapeName } from './api';
import { createAudio } from './audio';

type PillShape = Exclude<ShapeName, 'text'>;

const SHAPES: PillShape[] = ['galaxy', 'sphere', 'knot', 'heart', 'dna', 'saturn'];
const MAX_LEN = 40;
const SOUND_KEY = 'stars:sound';

// ---------- Icons (inline SVG, 1.5px stroke, 24-unit grid) ----------

const ICON = {
  soundOff: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M11 5 6 9H3v6h3l5 4V5z"/><path d="m22 9-6 6M16 9l6 6"/></svg>`,
  soundOn: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M11 5 6 9H3v6h3l5 4V5z"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/><path d="M18.5 5.5a9 9 0 0 1 0 13"/></svg>`,
  save: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4v11"/><path d="m7.5 10.5 4.5 4.5 4.5-4.5"/><path d="M4 17v2a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-2"/></svg>`,
  x: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 4l16 16"/><path d="M20 4 4 20"/></svg>`,
  link: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10 14a4 4 0 0 0 5.66 0l3-3a4 4 0 0 0-5.66-5.66l-1.5 1.5"/><path d="M14 10a4 4 0 0 0-5.66 0l-3 3a4 4 0 0 0 5.66 5.66l1.5-1.5"/></svg>`,
  hide: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 12s3.5-6 9-6 9 6 9 6-3.5 6-9 6-9-6-9-6z"/><circle cx="12" cy="12" r="2.5"/></svg>`,
  check: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12.5 4.5 4.5L19 7.5"/></svg>`,
  close: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg>`,
};

// ---------- Markup ----------

function markup(): string {
  const pills = SHAPES.map(
    (s) => `<button type="button" class="pill" data-shape="${s}">${s}</button>`,
  ).join('');

  return `
    <div class="intro" data-el="intro" aria-hidden="true">
      <h1 class="intro-title">A MILLION STARS</h1>
      <p class="intro-sub">type anything. a million stars will form it.</p>
    </div>

    <div class="brand">
      <div class="brand-name">A MILLION STARS</div>
      <div class="brand-count" data-el="count"></div>
    </div>

    <div class="tools" role="toolbar" aria-label="Tools">
      <button type="button" class="icon-btn" data-action="sound" aria-label="Toggle sound" title="Sound (M)">
        <span class="ico-main">${ICON.soundOff}</span><span class="ico-alt">${ICON.soundOn}</span>
      </button>
      <button type="button" class="icon-btn" data-action="save" aria-label="Save image" title="Save image (S)">
        <span class="ico-main">${ICON.save}</span><span class="ico-alt">${ICON.check}</span>
      </button>
      <button type="button" class="icon-btn" data-action="tweet" aria-label="Post on X" title="Post on X">
        <span class="ico-main">${ICON.x}</span>
      </button>
      <button type="button" class="icon-btn" data-action="copy" aria-label="Copy link" title="Copy link">
        <span class="ico-main">${ICON.link}</span><span class="ico-alt">${ICON.check}</span>
      </button>
      <button type="button" class="icon-btn" data-action="hide" aria-label="Hide UI" title="Hide UI (H)">
        <span class="ico-main">${ICON.hide}</span>
      </button>
    </div>

    <div class="composer">
      <div class="text-wrap">
        <input
          class="text-input"
          data-el="input"
          type="text"
          placeholder="type anything…"
          maxlength="${MAX_LEN}"
          autocomplete="off"
          autocorrect="off"
          autocapitalize="off"
          spellcheck="false"
          enterkeyhint="done"
          aria-label="Text to form with a million stars"
        />
      </div>
      <div class="pills" data-el="pills">
        ${pills}
        <button type="button" class="pill pill-next" data-action="next">⟳ next</button>
      </div>
    </div>

    <div class="hint">
      <span class="hint-desktop">hold to collapse · release to burst · drag to orbit · scroll to zoom · space for next shape</span>
      <span class="hint-touch">hold to collapse · release to burst · drag to orbit</span>
    </div>

    <div class="credit">built by <a href="#" target="_blank" rel="noopener">Claude Fable 5.1</a> in one night</div>

    <div class="toast-stack" data-el="toasts" aria-live="polite"></div>
  `;
}

// ---------- Helpers ----------

function debounce<T extends (...args: any[]) => void>(fn: T, ms: number): T {
  let t: number | undefined;
  return ((...args: any[]) => {
    if (t !== undefined) window.clearTimeout(t);
    t = window.setTimeout(() => fn(...args), ms);
  }) as T;
}

function isTouch(): boolean {
  return window.matchMedia('(hover: none) and (pointer: coarse)').matches;
}

function stars(): StarsAPI | undefined {
  return window.stars;
}

function shareUrl(text: string): string {
  const base = location.origin + location.pathname;
  return text ? `${base}?t=${encodeURIComponent(text)}` : base;
}

function tweetText(text: string): string {
  return text ? `I typed "${text}" into a million stars ✨` : `a million stars in your browser ✨`;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string);
}

// ---------- initUI ----------

export function initUI(): void {
  const root = document.getElementById('ui');
  if (!root) return;
  root.innerHTML = markup();

  const q = <T extends Element>(sel: string): T => root.querySelector(sel) as T;
  const intro = q<HTMLDivElement>('[data-el="intro"]');
  const countEl = q<HTMLDivElement>('[data-el="count"]');
  const input = q<HTMLInputElement>('[data-el="input"]');
  const pillsEl = q<HTMLDivElement>('[data-el="pills"]');
  const toasts = q<HTMLDivElement>('[data-el="toasts"]');
  const soundBtn = q<HTMLButtonElement>('[data-action="sound"]');
  const saveBtn = q<HTMLButtonElement>('[data-action="save"]');
  const copyBtn = q<HTMLButtonElement>('[data-action="copy"]');

  const touch = isTouch();
  const audio = createAudio();

  // ---------- Toasts ----------

  type ToastOpts = { ms?: number; dismissible?: boolean; onClick?: () => void };
  function toast(text: string, opts: ToastOpts = {}): () => void {
    const el = document.createElement('div');
    el.className = 'toast';
    el.innerHTML = `<span>${escapeHtml(text)}</span>`;
    if (opts.onClick) {
      el.style.pointerEvents = 'auto';
      el.style.cursor = 'pointer';
      el.addEventListener('click', () => { opts.onClick?.(); remove(); });
    }
    let removed = false;
    const remove = () => {
      if (removed) return;
      removed = true;
      el.classList.remove('is-in');
      window.setTimeout(() => el.remove(), 300);
    };
    if (opts.dismissible) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'toast-close';
      btn.setAttribute('aria-label', 'Dismiss');
      btn.innerHTML = ICON.close;
      btn.addEventListener('click', (e) => { e.stopPropagation(); remove(); });
      el.appendChild(btn);
    }
    toasts.appendChild(el);
    requestAnimationFrame(() => el.classList.add('is-in'));
    if (opts.ms !== 0) window.setTimeout(remove, opts.ms ?? 2000);
    return remove;
  }

  // ---------- Intro ----------

  let introGone = false;
  let introTimer: number | undefined;
  function dismissIntro() {
    if (introGone) return;
    introGone = true;
    if (introTimer !== undefined) window.clearTimeout(introTimer);
    intro.classList.add('is-gone');
    window.setTimeout(() => intro.remove(), 1400);
  }

  // ---------- State ----------

  let ready = false;
  let currentText = '';
  let currentShape: ShapeName = 'galaxy';
  let soundWanted = false;
  try { soundWanted = localStorage.getItem(SOUND_KEY) === '1'; } catch { /* private mode */ }
  let audioStarted = false;

  function renderCount() {
    const s = stars();
    if (!s) return;
    const n = s.getState().count;
    countEl.textContent = `${n.toLocaleString('en-US')} stars`;
  }

  function renderPills() {
    pillsEl.querySelectorAll<HTMLButtonElement>('.pill[data-shape]').forEach((b) => {
      b.classList.toggle('is-active', !currentText && b.dataset.shape === currentShape);
    });
  }

  function renderSound() {
    soundBtn.classList.toggle('is-on', soundWanted);
    soundBtn.setAttribute('aria-pressed', soundWanted ? 'true' : 'false');
  }

  function flash(btn: HTMLButtonElement, ms = 1200) {
    btn.classList.add('is-on');
    window.setTimeout(() => btn.classList.remove('is-on'), ms);
  }

  // ---------- Audio wiring ----------

  async function ensureAudio() {
    if (audioStarted) return;
    audioStarted = true;
    try { await audio.start(); } catch { audioStarted = false; }
  }

  async function applySoundPref() {
    // Called from a user gesture. Aligns the audio engine with soundWanted.
    if (!soundWanted) {
      if (audioStarted && audio.isOn()) audio.toggle();
      return;
    }
    await ensureAudio();
    if (audioStarted && !audio.isOn()) audio.toggle();
  }

  function setSound(on: boolean) {
    soundWanted = on;
    try { localStorage.setItem(SOUND_KEY, on ? '1' : '0'); } catch { /* ignore */ }
    renderSound();
    void applySoundPref();
  }

  function onFirstGesture() {
    window.removeEventListener('pointerdown', onFirstGesture, true);
    window.removeEventListener('keydown', onFirstGesture, true);
    if (soundWanted) void applySoundPref();
  }
  window.addEventListener('pointerdown', onFirstGesture, true);
  window.addEventListener('keydown', onFirstGesture, true);

  // ---------- Text input ----------

  const pushText = debounce((value: string) => {
    stars()?.setText(value);
  }, 120);

  function syncAutoCycle() {
    const s = stars();
    if (!s) return;
    const active = document.activeElement === input || input.value.trim().length > 0;
    s.setAutoCycle(!active);
  }

  input.addEventListener('input', () => {
    const value = input.value.slice(0, MAX_LEN);
    if (value !== input.value) input.value = value;
    dismissIntro();
    pushText(value.trim() ? value : '');
    syncAutoCycle();
  });

  input.addEventListener('focus', syncAutoCycle);
  input.addEventListener('blur', syncAutoCycle);

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      clearInput();
      input.blur();
    } else if (e.key === 'Enter') {
      // Commit immediately and drop the virtual keyboard on phones.
      e.preventDefault();
      stars()?.setText(input.value.trim() ? input.value : '');
      if (touch) input.blur();
    }
    // Don't let global shortcuts fire while typing.
    e.stopPropagation();
  });

  function clearInput() {
    if (!input.value) return;
    input.value = '';
    stars()?.setText('');
    syncAutoCycle();
  }

  // ---------- Pills ----------

  pillsEl.addEventListener('click', (e) => {
    const btn = (e.target as HTMLElement).closest<HTMLButtonElement>('button');
    if (!btn) return;
    dismissIntro();
    const s = stars();
    if (!s) return;
    if (btn.dataset.shape) {
      input.value = '';
      syncAutoCycle();
      s.setShape(btn.dataset.shape as PillShape);
    } else if (btn.dataset.action === 'next') {
      input.value = '';
      syncAutoCycle();
      s.next();
    }
  });

  // ---------- Tools ----------

  async function saveImage() {
    const s = stars();
    if (!s) return;
    try {
      const blob = await s.screenshot();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'a-million-stars.png';
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 5000);
      flash(saveBtn);
      toast('image saved');
    } catch {
      toast('could not save image');
    }
  }

  function postOnX() {
    const text = stars()?.getState().text ?? currentText;
    const href =
      `https://twitter.com/intent/tweet?text=${encodeURIComponent(tweetText(text))}` +
      `&url=${encodeURIComponent(shareUrl(text))}`;
    window.open(href, '_blank', 'noopener,noreferrer');
  }

  async function copyLink() {
    const text = stars()?.getState().text ?? currentText;
    const url = shareUrl(text);
    try {
      await navigator.clipboard.writeText(url);
      flash(copyBtn);
      toast('link copied');
    } catch {
      // Fallback for browsers without async clipboard access.
      const ta = document.createElement('textarea');
      ta.value = url;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      let ok = false;
      try { ok = document.execCommand('copy'); } catch { ok = false; }
      ta.remove();
      if (ok) { flash(copyBtn); toast('link copied'); } else { toast(url, { ms: 4000 }); }
    }
  }

  let hidden = false;
  let hiddenToastRemove: (() => void) | undefined;
  function toggleUI(force?: boolean) {
    hidden = force ?? !hidden;
    root.classList.toggle('is-hidden', hidden);
    hiddenToastRemove?.();
    hiddenToastRemove = undefined;
    if (hidden) {
      if (document.activeElement === input) input.blur();
      hiddenToastRemove = touch
        ? toast('tap here to show UI', { ms: 0, onClick: () => toggleUI(false) })
        : toast('press H to show UI', { ms: 2000 });
    }
  }

  root.querySelector('.tools')!.addEventListener('click', (e) => {
    const btn = (e.target as HTMLElement).closest<HTMLButtonElement>('button[data-action]');
    if (!btn) return;
    dismissIntro();
    switch (btn.dataset.action) {
      case 'sound': setSound(!soundWanted); break;
      case 'save': void saveImage(); break;
      case 'tweet': postOnX(); break;
      case 'copy': void copyLink(); break;
      case 'hide': toggleUI(); break;
    }
  });

  // ---------- Global keyboard ----------

  window.addEventListener('keydown', (e) => {
    if (e.defaultPrevented) return;
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const target = e.target as HTMLElement | null;
    const typing = target === input || (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable));

    if (e.key === '/' && !typing) {
      e.preventDefault();
      if (hidden) toggleUI(false);
      input.focus();
      return;
    }
    if (typing) return;

    switch (e.key) {
      case ' ':
        e.preventDefault();
        dismissIntro();
        stars()?.next();
        break;
      case 'h': case 'H':
        toggleUI();
        break;
      case 's': case 'S':
        void saveImage();
        break;
      case 'm': case 'M':
        setSound(!soundWanted);
        break;
      case 'Escape':
        if (hidden) toggleUI(false);
        break;
      default:
        // Any printable key starts typing into the input.
        if (e.key.length === 1 && !e.repeat) {
          if (hidden) return;
          input.focus();
          // Let the keypress land in the input naturally.
          dismissIntro();
        }
    }
  });

  // First click/tap anywhere ends the intro.
  window.addEventListener('pointerdown', () => dismissIntro(), { once: true, capture: true });
  window.addEventListener('keydown', () => dismissIntro(), { once: true, capture: true });

  // Desktop: clicking/dragging the canvas blurs the input; give focus back on release so
  // typing keeps working without reaching for `/`. Never on touch (would pop the keyboard).
  if (!touch) {
    window.addEventListener('pointerup', (e) => {
      if (hidden) return;
      const t = e.target as HTMLElement | null;
      if (t && t.id === 'c' && document.activeElement !== input) {
        input.focus({ preventScroll: true });
      }
    });
  }

  // ---------- URL sync ----------

  const syncUrl = debounce((text: string) => {
    const url = new URL(location.href);
    if (text) url.searchParams.set('t', text); else url.searchParams.delete('t');
    const next = url.pathname + url.search + url.hash;
    const cur = location.pathname + location.search + location.hash;
    if (next !== cur) history.replaceState(history.state, '', next);
  }, 300);

  // ---------- Engine events ----------

  function onReady() {
    if (ready) return;
    ready = true;
    renderCount();
    const st = stars()?.getState();
    if (st) {
      currentText = st.text;
      currentShape = st.shape;
      if (st.text && document.activeElement !== input) input.value = st.text;
      renderPills();
      syncAutoCycle();
    }
    introTimer = window.setTimeout(dismissIntro, 2500);
    if (!touch && document.activeElement !== input) input.focus({ preventScroll: true });
  }

  window.addEventListener('stars:ready', onReady);
  if (stars()) onReady();

  window.addEventListener('stars:morph', (e: Event) => {
    const d = (e as CustomEvent<{ shape: ShapeName; text: string }>).detail;
    if (!d) return;
    currentShape = d.shape;
    currentText = d.text ?? '';
    // Keep the input in sync with text set from elsewhere (e.g. ?t= on load), never while typing.
    if (document.activeElement !== input && input.value !== currentText) input.value = currentText;
    renderPills();
    syncUrl(currentText);
    if (soundWanted && audioStarted && audio.isOn()) audio.whoosh();
  });

  window.addEventListener('stars:collapse', () => {
    if (soundWanted && audioStarted && audio.isOn()) audio.collapseStart();
  });

  window.addEventListener('stars:burst', () => {
    if (soundWanted && audioStarted && audio.isOn()) {
      audio.collapseStop();
      audio.burst();
    }
  });

  // Performance toast: fps < 24 continuously for > 3s, shown once.
  let lowSince: number | undefined;
  let perfToastShown = false;
  window.addEventListener('stars:fps', (e: Event) => {
    const fps = (e as CustomEvent<{ fps: number }>).detail?.fps;
    if (typeof fps !== 'number') return;
    if (fps < 24) {
      lowSince ??= performance.now();
      if (!perfToastShown && performance.now() - lowSince > 3000) {
        perfToastShown = true;
        toast('running in performance mode', { ms: 0, dismissible: true });
      }
    } else {
      lowSince = undefined;
    }
  });

  // ---------- Mobile virtual keyboard: size the overlay to the visual viewport ----------

  const vv = window.visualViewport;
  if (vv) {
    const fit = () => {
      root.style.height = `${Math.round(vv.height)}px`;
      root.style.top = `${Math.round(vv.offsetTop)}px`;
    };
    vv.addEventListener('resize', fit);
    vv.addEventListener('scroll', fit);
    fit();
  }

  renderSound();
  renderPills();
}
