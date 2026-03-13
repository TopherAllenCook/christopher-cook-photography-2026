/* ═══════════════════════════════════════════════════════════════
   Christopher Cook Photography — Shared JS
   ═══════════════════════════════════════════════════════════════ */

// ── CONFIG — fill in your values ─────────────────────────────
const SUPABASE_URL      = 'YOUR_SUPABASE_URL';
const SUPABASE_ANON_KEY = 'YOUR_SUPABASE_ANON_KEY';

// ── Nav scroll behavior ───────────────────────────────────────
(function () {
  const nav = document.getElementById('mainNav');
  if (!nav) return;
  function updateNav() {
    nav.classList.toggle('scrolled', window.scrollY > 60);
  }
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

// ── Supabase image loader ─────────────────────────────────────
function applyImage(el, url) {
  el.style.backgroundImage    = `url('${url}')`;
  el.style.backgroundSize     = 'cover';
  el.style.backgroundPosition = 'center';
}

function loadSupabaseImages() {
  if (SUPABASE_URL.startsWith('YOUR') || typeof supabase === 'undefined') return;
  const sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  sb.from('site_images').select('slot, url').then(({ data }) => {
    if (!data) return;
    data.forEach(({ slot, url }) => {
      document.querySelectorAll(`[data-slot="${slot}"]`).forEach(el => applyImage(el, url));
      document.querySelectorAll(`[data-slot-dup="${slot}"]`).forEach(el => applyImage(el, url));
    });
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

document.addEventListener('DOMContentLoaded', loadSupabaseImages);
