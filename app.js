let PAGES = [];
let PARTS = []; // grouped {part, badge, accent, cover, items:[...]}
let activePartIdx = -1;
let activeItemIdx = -1;

const viewer = document.getElementById('viewer');
const sidebar = document.getElementById('sidebar');
const searchInput = document.getElementById('search-input');
const searchResults = document.getElementById('search-results');
const pageIndicator = document.getElementById('page-indicator');
const tocToggle = document.getElementById('toc-toggle');

PAGES = window.PAGES_DATA || [];
buildSlides();
buildSidebar();
setupObserver();
setupScrollSync();

function buildSlides() {
  const frag = document.createDocumentFragment();
  PAGES.forEach((p, i) => {
    const slide = document.createElement('div');
    slide.className = 'slide';
    slide.id = 'slide-' + p.page;
    slide.dataset.page = p.page;

    const img = document.createElement('img');
    img.loading = 'lazy';
    img.alt = p.title || p.badge;
    img.dataset.src = 'images/' + p.img;
    slide.appendChild(img);

    frag.appendChild(slide);
  });
  viewer.appendChild(frag);
}

// Lazy-load images as they approach viewport. This observer intentionally
// uses a generous rootMargin so images preload well before they're visible -
// it must NOT be used to drive the page indicator / sidebar highlight, since
// many slides can be "intersecting" under that margin at once and the entry
// order does not reflect what's actually on screen.
function setupObserver() {
  const io = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        const slide = entry.target;
        const img = slide.querySelector('img');
        if (img.dataset.src) {
          img.src = img.dataset.src;
          delete img.dataset.src;
        }
      }
    });
  }, { root: viewer, rootMargin: '200% 0px', threshold: 0.01 });

  document.querySelectorAll('.slide').forEach(s => io.observe(s));
}

// Keep the page indicator and left-side TOC highlight in sync with the
// actual scroll position of the right-side viewer (single source of truth:
// currentPage()). Throttled with requestAnimationFrame for smooth scrolling.
function setupScrollSync() {
  let ticking = false;
  let lastPage = -1;

  function update() {
    ticking = false;
    const page = currentPage();
    if (page !== lastPage) {
      lastPage = page;
      pageIndicator.textContent = page + ' / ' + PAGES.length;
      highlightSidebar(page);
    }
  }

  viewer.addEventListener('scroll', () => {
    if (!ticking) {
      ticking = true;
      requestAnimationFrame(update);
    }
  }, { passive: true });

  // initial sync
  update();
}

// ---------------- Sidebar / TOC ----------------
function buildSidebar() {
  PARTS = [];
  let current = null;
  PAGES.forEach(p => {
    if (p.type === 'cover') {
      current = { part: p.part, badge: p.badge, title: p.title, accent: p.accent, page: p.page, items: [] };
      PARTS.push(current);
    } else if (current) {
      // dedupe items by itemNo
      const last = current.items[current.items.length - 1];
      if (!last || last.itemNo !== p.itemNo) {
        current.items.push({ itemNo: p.itemNo, title: p.title, desc: p.desc, page: p.page });
      }
    }
  });

  const frag = document.createDocumentFragment();
  PARTS.forEach((part, idx) => {
    const wrap = document.createElement('div');
    wrap.className = 'toc-part';
    wrap.id = 'toc-part-' + idx;

    const head = document.createElement('div');
    head.className = 'toc-part-head';
    head.innerHTML = `<span><span class="toc-badge" style="background:${part.accent};color:#0c1e3c">${part.badge}</span>${part.title}</span><span class="chev">▾</span>`;
    head.addEventListener('click', () => {
      const itemsEl = wrap.querySelector('.toc-items');
      const willOpen = !itemsEl.classList.contains('open');
      document.querySelectorAll('.toc-items.open').forEach(el => el.classList.remove('open'));
      if (willOpen) itemsEl.classList.add('open');
      goToPage(part.page);
      maybeAutoCloseSidebar();
    });
    wrap.appendChild(head);

    const itemsEl = document.createElement('div');
    itemsEl.className = 'toc-items';
    part.items.forEach(it => {
      const row = document.createElement('div');
      row.className = 'toc-item';
      row.innerHTML = `<span class="ti-no">${it.itemNo}</span><span>${it.title}</span>`;
      row.addEventListener('click', (e) => {
        e.stopPropagation();
        goToPage(it.page);
        maybeAutoCloseSidebar();
      });
      itemsEl.appendChild(row);
      it.el = row;
    });
    wrap.appendChild(itemsEl);
    frag.appendChild(wrap);

    part.wrapEl = wrap;
    part.headEl = head;
    part.itemsEl = itemsEl;
  });
  sidebar.appendChild(frag);
}

// Scroll-spy: as the right-side content scrolls, auto-expand the matching
// left sidebar submenu and highlight the current position so the menu acts
// as a "you are here" navigator.
function highlightSidebar(pageNum) {
  if (!PARTS.length) return;

  // find the part whose section contains pageNum (last part with page <= pageNum)
  let partIdx = 0;
  for (let i = 0; i < PARTS.length; i++) {
    if (PARTS[i].page <= pageNum) partIdx = i; else break;
  }
  const part = PARTS[partIdx];

  // find the current item within that part (last item with page <= pageNum)
  let itemIdx = -1;
  for (let i = 0; i < part.items.length; i++) {
    if (part.items[i].page <= pageNum) itemIdx = i; else break;
  }

  if (partIdx !== activePartIdx) {
    // collapse every other submenu and expand this one
    PARTS.forEach((pt, i) => {
      pt.wrapEl.classList.toggle('active', i === partIdx);
      pt.itemsEl.classList.toggle('open', i === partIdx);
    });
    activePartIdx = partIdx;
    activeItemIdx = -1; // force item refresh below
    // keep the active section visible within the sidebar
    part.wrapEl.scrollIntoView({ block: 'nearest' });
  }

  if (itemIdx !== activeItemIdx) {
    part.items.forEach((it, i) => {
      if (it.el) it.el.classList.toggle('active', i === itemIdx);
    });
    activeItemIdx = itemIdx;
    const target = itemIdx >= 0 ? part.items[itemIdx].el : null;
    if (target) target.scrollIntoView({ block: 'nearest' });
  }
}

const sidebarBackdrop = document.getElementById('sidebar-backdrop');
const MOBILE_BREAKPOINT = 900;

function isMobile() {
  return window.innerWidth <= MOBILE_BREAKPOINT;
}

// On mobile/tablet, sidebar starts collapsed (off-canvas overlay)
if (isMobile()) {
  sidebar.classList.add('collapsed');
}

tocToggle.addEventListener('click', () => {
  sidebar.classList.toggle('collapsed');
});

// Tap backdrop to close the overlay sidebar on mobile
sidebarBackdrop.addEventListener('click', () => {
  sidebar.classList.add('collapsed');
});

// Auto-collapse sidebar on mobile after picking a TOC item
function maybeAutoCloseSidebar() {
  if (isMobile()) sidebar.classList.add('collapsed');
}

// Re-evaluate collapsed state on resize/orientation change
window.addEventListener('resize', () => {
  if (isMobile()) {
    sidebar.classList.add('collapsed');
  } else {
    sidebar.classList.remove('collapsed');
  }
});

// Register service worker for offline support
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  });
}

// ---------------- Navigation ----------------
function goToPage(pageNum) {
  const slide = document.getElementById('slide-' + pageNum);
  if (slide) {
    // ensure image loaded immediately
    const img = slide.querySelector('img');
    if (img.dataset.src) {
      img.src = img.dataset.src;
      delete img.dataset.src;
    }
    slide.scrollIntoView({ behavior: 'auto', block: 'start' });
    pageIndicator.textContent = pageNum + ' / ' + PAGES.length;
    highlightSidebar(pageNum);
  }
}

document.getElementById('jump-top').addEventListener('click', () => goToPage(1));
document.getElementById('jump-up').addEventListener('click', () => {
  const cur = currentPage();
  if (cur > 1) goToPage(cur - 1);
});
document.getElementById('jump-down').addEventListener('click', () => {
  const cur = currentPage();
  if (cur < PAGES.length) goToPage(cur + 1);
});

function currentPage() {
  // Compute from actual scroll position so keyboard navigation is reliable
  // regardless of mouse-wheel scroll direction/state.
  const idx = Math.round(viewer.scrollTop / viewer.clientHeight);
  const n = idx + 1;
  if (n < 1) return 1;
  if (n > PAGES.length) return PAGES.length;
  return n;
}

// keyboard navigation
document.addEventListener('keydown', (e) => {
  if (document.activeElement === searchInput) return;
  if (e.key === 'ArrowDown' || e.key === 'PageDown') { e.preventDefault(); goToPage(Math.min(currentPage() + 1, PAGES.length)); }
  if (e.key === 'ArrowUp' || e.key === 'PageUp') { e.preventDefault(); goToPage(Math.max(currentPage() - 1, 1)); }
  if (e.key === 'Home') { e.preventDefault(); goToPage(1); }
  if (e.key === 'End') { e.preventDefault(); goToPage(PAGES.length); }
});

// ---------------- Search ----------------
function escapeHtml(s) {
  return s.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

function highlight(text, q) {
  if (!text) return '';
  const idx = text.toLowerCase().indexOf(q.toLowerCase());
  if (idx === -1) return escapeHtml(text);
  return escapeHtml(text.slice(0, idx)) + '<mark>' + escapeHtml(text.slice(idx, idx + q.length)) + '</mark>' + escapeHtml(text.slice(idx + q.length));
}

searchInput.addEventListener('input', () => {
  const q = searchInput.value.trim();
  if (!q) {
    searchResults.classList.remove('show');
    searchResults.innerHTML = '';
    return;
  }
  const ql = q.toLowerCase();
  const matches = PAGES.filter(p => {
    const hay = [p.title, p.desc, p.badge].concat(p.keywords || []).filter(Boolean).join(' ').toLowerCase();
    return hay.includes(ql);
  }).slice(0, 40);

  if (matches.length === 0) {
    searchResults.innerHTML = '<div class="result-item"><span class="r-meta">검색 결과가 없습니다.</span></div>';
  } else {
    searchResults.innerHTML = matches.map(p => {
      const matchedKw = (p.keywords || []).find(k => k.toLowerCase().includes(ql));
      const titleHtml = p.title ? highlight(p.title, q) : highlight(p.badge, q);
      const metaParts = [p.badge, p.page + ' / ' + PAGES.length + '페이지'];
      if (matchedKw && matchedKw !== p.title) metaParts.push('키워드: ' + matchedKw);
      return `<div class="result-item" data-page="${p.page}">
        <span class="r-title">${titleHtml}</span>
        <span class="r-meta">${metaParts.join(' · ')}</span>
      </div>`;
    }).join('');
  }
  searchResults.classList.add('show');

  searchResults.querySelectorAll('.result-item[data-page]').forEach(el => {
    el.addEventListener('click', () => {
      goToPage(parseInt(el.dataset.page, 10));
      searchResults.classList.remove('show');
      searchInput.blur();
    });
  });
});

document.addEventListener('click', (e) => {
  if (!searchResults.contains(e.target) && e.target !== searchInput) {
    searchResults.classList.remove('show');
  }
});

searchInput.addEventListener('focus', () => {
  if (searchInput.value.trim()) searchResults.classList.add('show');
});
