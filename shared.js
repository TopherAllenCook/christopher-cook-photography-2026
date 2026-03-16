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

// ── Apply image to a background-image element ─────────────────
function applyImage(el, url, focalX, focalY, zoom) {
  var x = focalX != null ? focalX : 50;
  var y = focalY != null ? focalY : 50;
  var z = zoom   != null ? zoom   : 100;
  el.style.backgroundImage    = "url('" + url + "')";
  el.style.backgroundSize     = z > 100 ? z + '%' : 'cover';
  el.style.backgroundPosition = x + '% ' + y + '%';
}

// ── Apply fetched image data to the page ──────────────────────
function applyImageData(data) {
  if (!data || !data.length) return;
  var PRIORITY_SLOTS = ['hero-1', 'hero-2', 'hero-3'];
  var map = {};
  data.forEach(function (row) { map[row.slot] = row; });

  // 1 — Priority: load hero images instantly
  PRIORITY_SLOTS.forEach(function (slot) {
    if (!map[slot]) return;
    var r = map[slot];
    document.querySelectorAll('[data-slot="' + slot + '"]').forEach(function (el) { applyImage(el, r.url, r.focal_x, r.focal_y, r.zoom); });
    document.querySelectorAll('[data-slot-dup="' + slot + '"]').forEach(function (el) { applyImage(el, r.url, r.focal_x, r.focal_y, r.zoom); });
  });

  // 2 — Everything else: lazy load when 800px from viewport
  var lazySlots = data.filter(function (r) { return PRIORITY_SLOTS.indexOf(r.slot) === -1; });
  if (!lazySlots.length) return;

  var seen = new Set();
  var obs = new IntersectionObserver(function (entries) {
    entries.forEach(function (entry) {
      if (!entry.isIntersecting) return;
      var el   = entry.target;
      var slot = el.dataset.slot || el.dataset.slotDup;
      if (!slot || seen.has(el)) return;
      seen.add(el);
      obs.unobserve(el);
      var row = map[slot];
      if (row) applyImage(el, row.url, row.focal_x, row.focal_y, row.zoom);
    });
  }, { rootMargin: '800px 0px' });

  lazySlots.forEach(function (r) {
    document.querySelectorAll('[data-slot="' + r.slot + '"], [data-slot-dup="' + r.slot + '"]').forEach(function (el) { obs.observe(el); });
  });
}

// ── Load images from Supabase (SDK or direct fetch fallback) ──
function loadSupabaseImages() {
  // Try SDK first
  if (typeof supabase !== 'undefined') {
    try {
      var sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
      sb.from('site_images').select('slot, url, focal_x, focal_y, zoom').then(function (res) {
        if (res.data && res.data.length) {
          applyImageData(res.data);
        } else {
          loadImagesFallback();
        }
      }).catch(function () { loadImagesFallback(); });

      sb.from('site_settings').select('key, value').then(function (res) {
        if (!res.data) return;
        var settings = {};
        res.data.forEach(function (r) { settings[r.key] = r.value; });
        window.dispatchEvent(new CustomEvent('siteSettingsLoaded', { detail: settings }));
      }).catch(function () {});
      return;
    } catch (e) { /* fall through to fetch fallback */ }
  }
  loadImagesFallback();
}

// ── Direct fetch fallback (no SDK needed) ─────────────────────
function loadImagesFallback() {
  fetch(SUPABASE_URL + '/rest/v1/site_images?select=slot,url,focal_x,focal_y,zoom', {
    headers: { 'apikey': SUPABASE_ANON_KEY, 'Authorization': 'Bearer ' + SUPABASE_ANON_KEY }
  })
  .then(function (r) { return r.json(); })
  .then(function (data) { applyImageData(data); })
  .catch(function (e) { console.error('Image load failed:', e); });

  fetch(SUPABASE_URL + '/rest/v1/site_settings?select=key,value', {
    headers: { 'apikey': SUPABASE_ANON_KEY, 'Authorization': 'Bearer ' + SUPABASE_ANON_KEY }
  })
  .then(function (r) { return r.json(); })
  .then(function (data) {
    if (!data || !data.length) return;
    var settings = {};
    data.forEach(function (r) { settings[r.key] = r.value; });
    window.dispatchEvent(new CustomEvent('siteSettingsLoaded', { detail: settings }));
  })
  .catch(function () {});
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
    var attempts = 0;
    var poll = setInterval(function () {
      attempts++;
      if (typeof supabase !== 'undefined') { clearInterval(poll); loadSupabaseImages(); }
      else if (attempts > 30) { clearInterval(poll); loadImagesFallback(); } // fallback after 3s
    }, 100);
  }
}

document.addEventListener('DOMContentLoaded', boot);
