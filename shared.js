/* ═══════════════════════════════════════════════════════════════
   Christopher Cook Photography — Shared JS
   ═══════════════════════════════════════════════════════════════ */

const SUPABASE_URL      = 'https://qxdtidacdmkdueudjkiu.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InF4ZHRpZGFjZG1rZHVldWRqa2l1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM1NTE1NjEsImV4cCI6MjA4OTEyNzU2MX0.Fh4uOTSXlwRAuPNGNrg02M-bbioJ0HNLl_nOfqaSg7Q';

// ── Nav scroll behavior ───────────────────────────────────────
(function () {
  const nav = document.getElementById('mainNav');
  if (!nav) return;
  function updateNav() { nav.classList.toggle('scrolled', window.scrollY > 60); }
  window.addEventListener('scroll', updateNav, { passive: true });
  updateNav();
})();

// ── Mobile menu ───────────────────────────────────────────────
(function () {
  const hamburger = document.getElementById('hamburger');
  const overlay   = document.getElementById('navOverlay');
  const closeBtn  = document.getElementById('overlayClose');
  if (!hamburger || !overlay) return;
  hamburger.addEventListener('click', () => overlay.classList.add('open'));
  closeBtn && closeBtn.addEventListener('click', () => overlay.classList.remove('open'));
  window.closeOverlay = () => overlay.classList.remove('open');
})();

// ── Supabase image transforms ─────────────────────────────────
// Rewrites public URL to use render/image endpoint with width & quality
function optimizedUrl(rawUrl, slot) {
  if (!rawUrl || !rawUrl.includes('/object/public/')) return rawUrl;
  // Determine optimal width by slot type
  let w = 1200;
  if (slot && (slot.includes('hero') || slot.includes('bg') || slot.includes('cta'))) w = 1920;
  else if (slot && (slot.includes('avatar') || slot.includes('portrait'))) w = 600;
  else if (slot && slot.includes('gallery')) w = 800;
  // Swap /object/public/ to /render/image/public/ and add transforms
  return rawUrl.replace('/object/public/', '/render/image/public/') + '?width=' + w + '&quality=75';
}

// ── Apply image to a background-image element ─────────────────
function applyImage(el, url, focalX, focalY, zoom, slot) {
  const x = focalX != null ? focalX : 50;
  const y = focalY != null ? focalY : 50;
  const z = zoom   != null ? zoom   : 100;
  const src = optimizedUrl(url, slot);
  const img = new Image();
  img.onload = () => {
    el.style.backgroundImage    = `url('${src}')`;
    el.style.backgroundSize     = z > 100 ? `${z}%` : 'cover';
    el.style.backgroundPosition = `${x}% ${y}%`;
  };
  img.src = src;
}

// ── Load images from Supabase with smart lazy loading ─────────
function loadSupabaseImages() {
  if (typeof supabase === 'undefined') return;
  const sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

  // Above-fold hero slots — load immediately, no waiting
  const PRIORITY_SLOTS = ['hero-1', 'hero-2', 'hero-3'];

  sb.from('site_images').select('slot, url, focal_x, focal_y, zoom').then(({ data }) => {
    if (!data) return;

    const map = {};
    data.forEach(row => { map[row.slot] = row; });

    // 1 — Priority: load hero images instantly (no IntersectionObserver)
    PRIORITY_SLOTS.forEach(slot => {
      if (!map[slot]) return;
      const { url, focal_x, focal_y, zoom } = map[slot];
      document.querySelectorAll(`[data-slot="${slot}"]`).forEach(el => applyImage(el, url, focal_x, focal_y, zoom, slot));
      document.querySelectorAll(`[data-slot-dup="${slot}"]`).forEach(el => applyImage(el, url, focal_x, focal_y, zoom, slot));
    });

    // 2 — Everything else: lazy load when 800px from viewport
    const lazySlots = data.filter(r => !PRIORITY_SLOTS.includes(r.slot));
    if (!lazySlots.length) return;

    const seen = new Set();
    const obs = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (!entry.isIntersecting) return;
        const el   = entry.target;
        const slot = el.dataset.slot || el.dataset.slotDup;
        if (!slot || seen.has(el)) return;
        seen.add(el);
        obs.unobserve(el);
        const row = map[slot];
        if (row) applyImage(el, row.url, row.focal_x, row.focal_y, row.zoom, slot);
      });
    }, { rootMargin: '800px 0px' }); // pre-fetch 800px before entering view

    lazySlots.forEach(({ slot }) => {
      document.querySelectorAll(`[data-slot="${slot}"], [data-slot-dup="${slot}"]`).forEach(el => obs.observe(el));
    });
  });

  // Site settings (hero type etc.)
  sb.from('site_settings').select('key, value').then(({ data }) => {
    if (!data) return;
    const settings = {};
    data.forEach(({ key, value }) => { settings[key] = value; });
    window.dispatchEvent(new CustomEvent('siteSettingsLoaded', { detail: settings }));
  });
}

// ── Scroll fade-in ────────────────────────────────────────────
function initFadeIn(selector) {
  const els = document.querySelectorAll(selector);
  if (!els.length) return;
  const obs = new IntersectionObserver((entries) => {
    entries.forEach(e => {
      if (e.isIntersecting) {
        e.target.style.opacity   = '1';
        e.target.style.transform = 'translateY(0)';
        obs.unobserve(e.target);
      }
    });
  }, { threshold: 0.08 });
  els.forEach(el => {
    el.style.opacity    = '0';
    el.style.transform  = 'translateY(28px)';
    el.style.transition = 'opacity .8s ease, transform .8s ease';
    obs.observe(el);
  });
}

// ── Lazy-load GSAP + ScrollTrigger after first paint ──────────
function loadGSAP(callback) {
  if (typeof gsap !== 'undefined') { callback(); return; }
  var s1 = document.createElement('script');
  s1.src = 'https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.5/gsap.min.js';
  s1.onload = function () {
    var s2 = document.createElement('script');
    s2.src = 'https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.5/ScrollTrigger.min.js';
    s2.onload = callback;
    document.head.appendChild(s2);
  };
  document.head.appendChild(s1);
}

// ── Boot: wait for async Supabase SDK then load images ────────
function boot() {
  if (typeof supabase !== 'undefined') {
    loadSupabaseImages();
  } else {
    // SDK still loading (async) — poll briefly
    var attempts = 0;
    var poll = setInterval(function () {
      attempts++;
      if (typeof supabase !== 'undefined') { clearInterval(poll); loadSupabaseImages(); }
      else if (attempts > 50) clearInterval(poll); // give up after 5s
    }, 100);
  }
}

document.addEventListener('DOMContentLoaded', boot);
