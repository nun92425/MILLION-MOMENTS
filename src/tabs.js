const panels = {
  mosaic: document.getElementById('view-mosaic'),
  moire: document.getElementById('view-moire'),
  silhouette: document.getElementById('view-silhouette'),
  stereogram: document.getElementById('view-stereogram')
};

function switchTab(name) {
  const valid = panels[name] ? name : 'mosaic';
  document.querySelectorAll('.nav-link.is-tool').forEach(a => {
    a.classList.toggle('active', a.dataset.tab === valid);
  });
  Object.entries(panels).forEach(([k, el]) => {
    if (!el) return;
    const isActive = k === valid;
    el.classList.toggle('hidden', !isActive);
    el.classList.toggle('is-active', isActive);
    el.setAttribute('aria-hidden', String(!isActive));
  });
  // Anchor links: if switching to mosaic, keep howto visible; else hide? Keep related always visible
  if (location.hash !== '#' + valid) {
    history.replaceState(null, '', '#' + valid);
  }
  document.title = valid === 'moire' ? 'Moire - MILLION MOMENTS' : valid === 'silhouette' ? 'Silhouette - MILLION MOMENTS' : valid === 'stereogram' ? 'Stereogram - MILLION MOMENTS' : 'MILLION MOMENTS - フォトモザイク生成ツール';
}

  document.querySelectorAll('[data-tab]').forEach(a => {
  a.addEventListener('click', (e) => {
    e.preventDefault();
    switchTab(a.dataset.tab);
    if (a.dataset.tab === 'moire') import('./moire.js').then(m => m.initMoire && m.initMoire());
    if (a.dataset.tab === 'silhouette') import('./silhouette.js').then(m => m.initSilhouette && m.initSilhouette());
    if (a.dataset.tab === 'stereogram') import('./stereogram.js').then(m => m.initStereogram && m.initStereogram());
  });
});

// Anchor links that point inside mosaic should switch tab first
document.querySelectorAll('.nav-link.is-anchor').forEach(a => {
  a.addEventListener('click', (e) => {
    const hash = a.getAttribute('href');
    if (hash && hash.startsWith('#')) {
      const target = document.querySelector(hash);
      if (target && target.closest('#view-mosaic')) {
        switchTab('mosaic');
      }
    }
  });
});

function initFromHash() {
  const hash = location.hash.replace('#', '');
  if (hash === 'moire' || hash === 'silhouette' || hash === 'stereogram' || hash === 'mosaic') {
    switchTab(hash);
    if (hash === 'moire') import('./moire.js').then(m => m.initMoire && m.initMoire());
    if (hash === 'silhouette') import('./silhouette.js').then(m => m.initSilhouette && m.initSilhouette());
    if (hash === 'stereogram') import('./stereogram.js').then(m => m.initStereogram && m.initStereogram());
  } else switchTab('mosaic');
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initFromHash);
else initFromHash();

window.addEventListener('hashchange', () => {
  const h = location.hash.replace('#', '');
  if (h) {
    switchTab(h);
    if (h === 'moire') import('./moire.js').then(m => m.initMoire && m.initMoire());
    if (h === 'silhouette') import('./silhouette.js').then(m => m.initSilhouette && m.initSilhouette());
    if (h === 'stereogram') import('./stereogram.js').then(m => m.initStereogram && m.initStereogram());
  }
});

export { switchTab };
