/* ═══════════════════════════════════════════════════════════════
   Christopher Cook Photography — Shared JS
   ═══════════════════════════════════════════════════════════════ */

const SUPABASE_URL      = 'https://mmvyplpghfnuacglwhou.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1tdnlwbHBnaGZudWFjZ2x3aG91Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM0MjcxMTAsImV4cCI6MjA4OTAwMzExMH0.R9OjlUSUVZph7rhh9oR_8e3wUuSPl5gE9WROIejzTPs';

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

// ── Optimized image URL (resize + WebP via Supabase transform) ──
function optimizeUrl(url, width) {
  if (!url || url.indexOf('/storage/v1/object/public/') === -1) return url;
  // Supabase image transform: resize + convert to WebP
  var w = width || 1920;
  return url.replace('/object/public/', '/object/public/') + '?width=' + w + '&format=webp&quality=80';
}

// ── Apply image to a background-image element ─────────────────
function applyImage(el, url, focalX, focalY, zoom, width) {
  var x = focalX != null ? focalX : 50;
  var y = focalY != null ? focalY : 50;
  var z = zoom   != null ? zoom   : 100;
  var optimized = optimizeUrl(url, width);
  el.style.backgroundImage    = "url('" + optimized + "')";
  el.style.backgroundSize     = z > 100 ? z + '%' : 'cover';
  el.style.backgroundPosition = x + '% ' + y + '%';
}

// ── Apply fetched image data to the page ──────────────────────
function applyImageData(data) {
  if (!data || !data.length) return;
  var PRIORITY_SLOTS = ['hero-1', 'hero-2', 'hero-3'];
  var map = {};
  data.forEach(function (row) { map[row.slot] = row; });

  // 1 — Priority: load hero-1 instantly at full width, defer hero-2/3
  var first = map['hero-1'];
  if (first) {
    document.querySelectorAll('[data-slot="hero-1"]').forEach(function (el) { applyImage(el, first.url, first.focal_x, first.focal_y, first.zoom, 1920); });
    document.querySelectorAll('[data-slot-dup="hero-1"]').forEach(function (el) { applyImage(el, first.url, first.focal_x, first.focal_y, first.zoom, 1920); });
  }
  // Preload hero-2/3 after a short delay so hero-1 paints first
  setTimeout(function () {
    ['hero-2', 'hero-3'].forEach(function (slot) {
      if (!map[slot]) return;
      var r = map[slot];
      document.querySelectorAll('[data-slot="' + slot + '"]').forEach(function (el) { applyImage(el, r.url, r.focal_x, r.focal_y, r.zoom, 1920); });
      document.querySelectorAll('[data-slot-dup="' + slot + '"]').forEach(function (el) { applyImage(el, r.url, r.focal_x, r.focal_y, r.zoom, 1920); });
    });
  }, 100);

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
      // Size images based on their role: full-width bg = 1920, cards/thumbs = 800
      var w = (slot.indexOf('hero') > -1 || slot.indexOf('cta-bg') > -1 || slot.indexOf('hero-bg') > -1) ? 1920 : 800;
      if (row) applyImage(el, row.url, row.focal_x, row.focal_y, row.zoom, w);
    });
  }, { rootMargin: '800px 0px' });

  lazySlots.forEach(function (r) {
    document.querySelectorAll('[data-slot="' + r.slot + '"], [data-slot-dup="' + r.slot + '"]').forEach(function (el) { obs.observe(el); });
  });
}

// ── Apply fetched copy/text data to the page ────────────────────
function applyCopyData(data) {
  if (!data || !data.length) return;
  data.forEach(function (row) {
    document.querySelectorAll('[data-copy="' + row.slot + '"]').forEach(function (el) {
      el.innerHTML = row.value;
    });
  });
}

// ── Load data from Supabase via direct REST API fetch ─────────
function loadSupabaseData() {
  var headers = { 'apikey': SUPABASE_ANON_KEY, 'Authorization': 'Bearer ' + SUPABASE_ANON_KEY };

  fetch(SUPABASE_URL + '/rest/v1/site_images?select=slot,url,focal_x,focal_y,zoom', { headers: headers })
    .then(function (r) { return r.json(); })
    .then(function (data) { applyImageData(data); })
    .catch(function (e) { console.error('Image load failed:', e); });

  fetch(SUPABASE_URL + '/rest/v1/site_settings?select=key,value', { headers: headers })
    .then(function (r) { return r.json(); })
    .then(function (data) {
      if (!data || !data.length) return;
      var settings = {};
      data.forEach(function (r) { settings[r.key] = r.value; });
      window.dispatchEvent(new CustomEvent('siteSettingsLoaded', { detail: settings }));
    })
    .catch(function () {});

  fetch(SUPABASE_URL + '/rest/v1/site_content?select=slot,value', { headers: headers })
    .then(function (r) { return r.json(); })
    .then(function (data) { applyCopyData(data); })
    .catch(function () {});
}

// ── Instagram Feed ───────────────────────────────────────────
function loadInstagramFeed(token) {
  if (!token) return;
  var grid = document.querySelector('.instagram-grid-placeholder');
  if (!grid) return;
  fetch('https://graph.instagram.com/me/media?fields=id,media_type,media_url,thumbnail_url,permalink,timestamp&access_token=' + token + '&limit=6')
    .then(function (r) { return r.json(); })
    .then(function (json) {
      if (json.error || !json.data) return;
      grid.innerHTML = '';
      json.data.slice(0, 6).forEach(function (post) {
        var a = document.createElement('a');
        a.href = post.permalink;
        a.target = '_blank';
        a.rel = 'noopener';
        a.style.cssText = 'display:block;aspect-ratio:1;overflow:hidden;';
        var url = post.media_type === 'VIDEO' ? post.thumbnail_url : post.media_url;
        var img = document.createElement('img');
        img.src = url;
        img.alt = 'Instagram post';
        img.loading = 'lazy';
        img.style.cssText = 'width:100%;height:100%;object-fit:cover;transition:transform .4s ease;';
        a.addEventListener('mouseenter', function () { img.style.transform = 'scale(1.05)'; });
        a.addEventListener('mouseleave', function () { img.style.transform = ''; });
        a.appendChild(img);
        grid.appendChild(a);
      });
    })
    .catch(function () { /* keep placeholder */ });
}

window.addEventListener('siteSettingsLoaded', function (e) {
  if (e.detail && e.detail.instagram_token) {
    loadInstagramFeed(e.detail.instagram_token);
  }
});

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

// ── Boot ──────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', loadSupabaseData);
