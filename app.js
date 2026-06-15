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

    const frame = document.createElement('div');
    frame.className = 'frame';

    const img = document.createElement('img');
    img.loading = 'lazy';
    img.alt = p.title || p.badge;
    img.dataset.src = 'images/' + p.img;
    frame.appendChild(img);
    slide.appendChild(frame);

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
function goToPage(pageNum, behavior) {
  const slide = document.getElementById('slide-' + pageNum);
  if (slide) {
    // ensure image loaded immediately
    const img = slide.querySelector('img');
    if (img.dataset.src) {
      img.src = img.dataset.src;
      delete img.dataset.src;
    }
    slide.scrollIntoView({ behavior: behavior || 'auto', block: 'start' });
    pageIndicator.textContent = pageNum + ' / ' + PAGES.length;
    highlightSidebar(pageNum);
  }
}

// ---------------- Zoom ----------------
const ZOOM_MIN = 1;
const ZOOM_MAX = 3;
const ZOOM_STEP = 0.25;
let zoomLevel = 1;
const zoomIndicator = document.getElementById('zoom-indicator');
const appEl = document.getElementById('app');
const zoomInBtn = document.getElementById('zoom-in');
const zoomOutBtn = document.getElementById('zoom-out');

function setZoom(z) {
  zoomLevel = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Math.round(z * 100) / 100));
  document.documentElement.style.setProperty('--zoom', zoomLevel);
  appEl.classList.toggle('zoomed', zoomLevel > 1);
  zoomIndicator.textContent = Math.round(zoomLevel * 100) + '%';
  zoomInBtn.disabled = zoomLevel >= ZOOM_MAX;
  zoomOutBtn.disabled = zoomLevel <= ZOOM_MIN;
  if (zoomLevel === 1) {
    // Reset any panned position so the page is centered again next time
    document.querySelectorAll('.frame').forEach(f => { f.scrollLeft = 0; f.scrollTop = 0; });
  }
}

zoomInBtn.addEventListener('click', () => setZoom(zoomLevel + ZOOM_STEP));
zoomOutBtn.addEventListener('click', () => setZoom(zoomLevel - ZOOM_STEP));
setZoom(1);

// ---------------- Pan (drag to reposition zoomed image) ----------------
// When zoomed, .frame becomes a scrollable box (overflow:auto). Dragging
// with the mouse, or dragging a finger on touchscreens, scrolls that box
// so the user can reach any part of the enlarged page in any direction.
let panState = null;

function panStart(x, y, frame) {
  panState = {
    frame,
    startX: x,
    startY: y,
    scrollLeft: frame.scrollLeft,
    scrollTop: frame.scrollTop,
    viewerScrollTop: viewer.scrollTop,
    zoomedAtStart: zoomLevel > 1
  };
  frame.classList.add('dragging');
}

// How far (px) the user must drag/scroll past the top/bottom edge of the
// zoomed image before it counts as a "swipe to next/previous page" rather
// than an attempt to pan further.
const PAGE_NAV_OVERSCROLL = 60;

function panMove(x, y) {
  if (!panState) return;
  const frame = panState.frame;
  const dx = x - panState.startX;
  const dy = y - panState.startY;

  // Not zoomed: there's nothing to pan, so drag the page itself - just like
  // wheel/trackpad scrolling, the view follows the mouse 1:1 while dragging,
  // and snaps to the nearest page once the mouse is released.
  if (!panState.zoomedAtStart) {
    viewer.scrollTop = panState.viewerScrollTop - dy;
    return;
  }

  const maxScrollTop = frame.scrollHeight - frame.clientHeight;
  const newScrollTop = panState.scrollTop - dy;

  // Dragged past the top edge by more than the threshold -> previous page
  if (newScrollTop < -PAGE_NAV_OVERSCROLL) {
    const cur = currentPage();
    panEnd();
    if (cur > 1) goToPage(cur - 1, 'smooth');
    return;
  }
  // Dragged past the bottom edge by more than the threshold -> next page
  if (newScrollTop > maxScrollTop + PAGE_NAV_OVERSCROLL) {
    const cur = currentPage();
    panEnd();
    if (cur < PAGES.length) goToPage(cur + 1, 'smooth');
    return;
  }

  frame.scrollLeft = panState.scrollLeft - dx;
  frame.scrollTop = Math.max(0, Math.min(maxScrollTop, newScrollTop));
}

function panEnd() {
  if (!panState) return;
  const wasUnzoomedDrag = !panState.zoomedAtStart;
  panState.frame.classList.remove('dragging');
  panState = null;
  if (wasUnzoomedDrag) {
    // Snap smoothly to whichever page is now most in view, just like a
    // wheel scroll settling on a page.
    goToPage(currentPage(), 'smooth');
  }
}

// Mouse drag - works both zoomed (pan/overscroll page nav) and at 100%
// (plain vertical drag flips pages).
viewer.addEventListener('mousedown', (e) => {
  const frame = e.target.closest('.frame');
  if (!frame) return;
  e.preventDefault();
  panStart(e.clientX, e.clientY, frame);
});

window.addEventListener('mousemove', (e) => {
  if (!panState) return;
  e.preventDefault();
  panMove(e.clientX, e.clientY);
});

window.addEventListener('mouseup', panEnd);
window.addEventListener('mouseleave', panEnd);

// Touch drag
viewer.addEventListener('touchstart', (e) => {
  if (zoomLevel <= 1) return;
  const frame = e.target.closest('.frame');
  if (!frame) return;
  const t = e.touches[0];
  panStart(t.clientX, t.clientY, frame);
}, { passive: true });

viewer.addEventListener('touchmove', (e) => {
  if (!panState) return;
  // Prevent the outer viewer from scrolling/navigating pages while
  // panning a zoomed image with a finger.
  e.preventDefault();
  const t = e.touches[0];
  panMove(t.clientX, t.clientY);
}, { passive: false });

viewer.addEventListener('touchend', panEnd);
viewer.addEventListener('touchcancel', panEnd);

// Mouse-wheel / trackpad scroll while zoomed: pan inside the current frame
// instead of letting the scroll bubble up to #viewer (which would make the
// previous/next page visually overlap mid-transition). Once the frame is
// already scrolled all the way to the top/bottom, further scrolling in that
// direction cleanly switches to the previous/next page instead.
let lastWheelNav = 0;
viewer.addEventListener('wheel', (e) => {
  if (zoomLevel <= 1) return;
  const frame = e.target.closest('.frame');
  if (!frame) return;
  e.preventDefault();

  const maxScrollTop = frame.scrollHeight - frame.clientHeight;
  const atTop = frame.scrollTop <= 0;
  const atBottom = frame.scrollTop >= maxScrollTop - 1;
  const now = Date.now();

  if (e.deltaY < 0 && atTop) {
    if (now - lastWheelNav > 600) {
      const cur = currentPage();
      if (cur > 1) goToPage(cur - 1, 'smooth');
      lastWheelNav = now;
    }
    return;
  }
  if (e.deltaY > 0 && atBottom) {
    if (now - lastWheelNav > 600) {
      const cur = currentPage();
      if (cur < PAGES.length) goToPage(cur + 1, 'smooth');
      lastWheelNav = now;
    }
    return;
  }

  frame.scrollLeft += e.deltaX;
  frame.scrollTop += e.deltaY;
}, { passive: false });

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
