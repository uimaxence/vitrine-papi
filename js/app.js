/* Christian Cailleau — galerie
   Une seule page, trois vues : la galerie (#/), la fiche d'un tableau (#/tableau/slug)
   et À propos (#/a-propos). Le tableau cliqué glisse de la galerie jusqu'à sa fiche. */

(() => {
  const { createApp, reactive, ref, computed, watch, onMounted, onBeforeUnmount, nextTick } = Vue;

  const REDUCED = window.matchMedia('(prefers-reduced-motion: reduce)');
  const OFFSETS = [0, 44, -18, 10, -40, 28, -8, 48, -26, 16];

  // Carte de la galerie : proportions 4:5, marge intérieure 7 % (doit rester cohérent avec .card dans le CSS)
  const CARD_RATIO = 4 / 5;
  const CARD_PAD = 0.07;
  const CARD_INNER_RATIO = (1 - 2 * CARD_PAD) / (1 / CARD_RATIO - 2 * CARD_PAD);

  const store = reactive({
    paintings: [],
    categories: [],   // [{ id, label }] dans l'ordre d'affichage (paintings.json)
    filter: 'tous',   // 'tous' ou l'id d'une catégorie
    loaded: false,
    error: null,
    lightbox: null,
    galleryScroll: 0
  });

  // Tri par catégorie : un tableau peut porter plusieurs tags.
  const hasTag = (p, id) => Array.isArray(p.tags) && p.tags.includes(id);
  const visible = computed(() => (store.filter === 'tous' ? store.paintings : store.paintings.filter((p) => hasTag(p, store.filter))));
  const filters = computed(() => {
    const list = [{ id: 'tous', label: 'Tous', n: store.paintings.length }];
    store.categories.forEach((c) => {
      const n = store.paintings.filter((p) => hasTag(p, c.id)).length;
      if (n) list.push({ id: c.id, label: c.label, n });
    });
    return list;
  });
  // La catégorie choisie survit à un rechargement de l'onglet.
  function rememberFilter(id) { try { sessionStorage.setItem('cc-filter', id); } catch (_) { /* ignore */ } }
  function recallFilter() { try { return sessionStorage.getItem('cc-filter') || 'tous'; } catch (_) { return 'tous'; } }

  // Transition partagée en cours : { slug, ghost }
  const flip = { pending: null };
  const preloaded = new Set();

  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  const imgSrc = (p, size) => `assets/img/tableaux/${p.image}${size === 800 ? '-800' : ''}.jpg`;
  const imgSet = (p) => `${imgSrc(p, 800)} ${Math.round(p.w / 2)}w, ${imgSrc(p)} ${p.w}w`;
  const insituSrc = (name, size) => `assets/img/insitu/${name}${size === 1000 ? '-1000' : ''}.jpg`;
  const insituSet = (name) => `${insituSrc(name, 1000)} 1000w, ${insituSrc(name)} 2000w`;
  const photoSrc = (name, size) => `assets/img/atelier/${name}${size === 1000 ? '-1000' : ''}.jpg`;
  const photoSet = (name) => `${photoSrc(name, 1000)} 750w, ${photoSrc(name)} 1500w`;

  // Largeur de la feuille dans la carte, pour que le tableau tienne dans la marge quelle que soit sa forme.
  function sheetStyle(p) {
    const r = p.w / p.h;
    const pct = Math.min(100, (r / CARD_INNER_RATIO) * 100);
    return { width: `${pct}%`, aspectRatio: `${p.w} / ${p.h}` };
  }

  function preload(p) {
    if (preloaded.has(p.slug)) return;
    preloaded.add(p.slug);
    const a = new Image();
    a.sizes = '40vw';
    a.srcset = imgSet(p);
    a.src = imgSrc(p);
    if (p.insitu) { const b = new Image(); b.src = insituSrc(p.insitu, 1000); }
  }

  function parseHash() {
    const h = decodeURIComponent(location.hash.replace(/^#\/?/, ''));
    if (h.startsWith('tableau/')) return { name: 'detail', slug: h.slice(8) };
    if (h === 'a-propos') return { name: 'about', slug: null };
    return { name: 'gallery', slug: null };
  }

  /* ---------- Ghost : copie fixe d'un tableau qui vole d'une position à l'autre ---------- */

  function makeGhost(fromEl) {
    const r = fromEl.getBoundingClientRect();
    const el = document.createElement('div');
    el.className = 'ghost';
    Object.assign(el.style, { left: `${r.left}px`, top: `${r.top}px`, width: `${r.width}px`, height: `${r.height}px` });
    const im = document.createElement('img');
    im.src = fromEl.currentSrc || fromEl.src;
    im.alt = '';
    el.appendChild(im);
    document.body.appendChild(el);
    return { el, rect: r };
  }

  function dropGhost(pend) {
    if (pend && pend.ghost) pend.ghost.el.remove();
  }

  // Fait voler le ghost jusqu'à toEl, puis appelle onLanded(release) : release() retire le ghost.
  function flyGhost(ghost, toEl, onLanded) {
    const t = toEl.getBoundingClientRect();
    const f = ghost.rect;
    const release = () => ghost.el.remove();
    if (!t.width || !t.height) { onLanded(release); return; }
    Object.assign(ghost.el.style, {
      left: `${t.left}px`, top: `${t.top}px`, width: `${t.width}px`, height: `${t.height}px`,
      transformOrigin: '0 0'
    });
    const from = `translate(${f.left - t.left}px, ${f.top - t.top}px) scale(${f.width / t.width}, ${f.height / t.height})`;
    const anim = ghost.el.animate(
      [{ transform: from }, { transform: 'none' }],
      { duration: 700, easing: 'cubic-bezier(0.32, 0.72, 0, 1)', fill: 'forwards' }
    );
    let done = false;
    const finish = () => { if (done) return; done = true; onLanded(release); };
    anim.onfinish = finish;
    anim.oncancel = finish;
    setTimeout(finish, 950);
  }

  // Révèle l'image cible quand elle est prête (évite un trou si la grande version n'est pas encore chargée).
  function landOn(img, release) {
    let shown = false;
    const show = () => {
      if (shown) return;
      shown = true;
      img.style.visibility = '';
      release();
    };
    if (img.complete && img.naturalWidth > 0) show();
    else {
      img.addEventListener('load', show, { once: true });
      img.addEventListener('error', show, { once: true });
      setTimeout(show, 3000);
    }
  }

  /* ---------- En-tête ---------- */

  const SiteHeader = {
    props: { active: String },
    template: '#tpl-header',
    setup(props) {
      const nav = ref(null);
      const clip = reactive({ l: 0, r: 0, ready: false });
      const navActive = computed(() => (props.active === 'about' ? 'about' : 'gallery'));

      function measure() {
        const a = nav.value && nav.value.querySelector(':scope > a.on');
        if (!a) return;
        clip.l = a.offsetLeft;
        clip.r = nav.value.offsetWidth - (a.offsetLeft + a.offsetWidth);
        clip.ready = true;
      }

      onMounted(() => {
        measure();
        window.addEventListener('resize', measure);
        if (document.fonts && document.fonts.ready) document.fonts.ready.then(measure);
      });
      onBeforeUnmount(() => window.removeEventListener('resize', measure));
      watch(navActive, () => nextTick(measure));

      const clipStyle = computed(() => ({
        clipPath: `inset(0 ${clip.r}px 0 ${clip.l}px)`,
        opacity: clip.ready ? 1 : 0
      }));

      return { nav, navActive, clipStyle };
    }
  };

  /* ---------- Galerie ---------- */

  const GalleryView = {
    template: '#tpl-gallery',
    setup() {
      const view = ref(null);
      const track = ref(null);
      const filtersEl = ref(null);
      const progress = reactive({ p: 0, frac: 1, index: 1 });
      const fbar = reactive({ l: 0, t: 0, w: 0, ready: false });
      // is-fresh : animation d'arrivée des tableaux, seulement au premier affichage (pas au retour d'une fiche, ni après un tri)
      const fresh = ref(!flip.pending && !REDUCED.matches);
      let freshTimer = 0;

      let target = 0, current = 0, raf = 0, animating = false;
      let down = false, dragging = false, startX = 0, startScroll = 0, lastX = 0, lastT = 0, vel = 0;

      const offset = (i) => (REDUCED.matches ? 0 : OFFSETS[i % OFFSETS.length]);
      const horizontal = () => !!track.value && getComputedStyle(track.value).overflowX !== 'visible';
      const maxScroll = () => Math.max(0, track.value.scrollWidth - track.value.clientWidth);
      const step = () => {
        const item = track.value && track.value.querySelector('.item:not(.grid-leave-active)');
        return (item ? item.getBoundingClientRect().width : 240) + 16;
      };

      function updateProgress() {
        const t = track.value;
        if (!t) return;
        const max = maxScroll();
        progress.p = max > 0 ? t.scrollLeft / max : 0;
        progress.frac = t.scrollWidth > 0 ? t.clientWidth / t.scrollWidth : 1;
        progress.index = clamp(Math.round(t.scrollLeft / step()) + 1, 1, visible.value.length || 1);
      }

      /* --- tri par catégorie --- */

      // Le trait noir se place sous le bouton actif (left/top/width mesurés, pour suivre un éventuel retour à la ligne).
      function measureBar() {
        const b = filtersEl.value && filtersEl.value.querySelector('.filter.on');
        if (!b) { fbar.ready = false; return; }
        fbar.l = b.offsetLeft;
        fbar.t = b.offsetTop + b.offsetHeight + 4;
        fbar.w = b.offsetWidth;
        fbar.ready = true;
      }

      const fbarStyle = computed(() => ({
        left: `${fbar.l}px`, top: `${fbar.t}px`, width: `${fbar.w}px`, opacity: fbar.ready ? 1 : 0
      }));

      function setFilter(id) {
        if (id === store.filter) return;
        store.filter = id;
        rememberFilter(id);
        fresh.value = false;
        store.galleryScroll = 0;
        cancelAnimationFrame(raf);
        animating = false;
        if (track.value) {
          if (horizontal()) nudge(-track.value.scrollLeft);
          else {
            // liste verticale : on remonte juste sous la rangée des catégories (collée en haut), pas plus haut que nécessaire
            const t = track.value;
            const f = filtersEl.value;
            const top = t && f ? Math.max(0, t.offsetTop - f.offsetHeight) : 0;
            if (window.scrollY > top) window.scrollTo({ top, behavior: REDUCED.matches ? 'auto' : 'smooth' });
          }
        }
        nextTick(() => { measureBar(); updateProgress(); });
      }

      // Un tableau qui quitte la rangée garde sa place (en absolu) le temps de s'effacer.
      function holdPlace(el) {
        el.style.left = `${el.offsetLeft}px`;
        el.style.top = `${el.offsetTop}px`;
      }

      const barStyle = computed(() => ({
        transform: `translateX(${progress.p * (1 - progress.frac) * 100}%) scaleX(${progress.frac})`
      }));

      function loop() {
        const t = track.value;
        if (!t) { animating = false; return; }
        const diff = target - current;
        if (Math.abs(diff) < 0.5) {
          current = target;
          t.scrollLeft = current;
          animating = false;
          return;
        }
        current += diff * 0.14;
        t.scrollLeft = current;
        raf = requestAnimationFrame(loop);
      }

      function nudge(dx) {
        if (!horizontal()) return;
        if (!animating) { current = track.value.scrollLeft; target = current; }
        target = clamp(target + dx, 0, maxScroll());
        if (!animating) { animating = true; raf = requestAnimationFrame(loop); }
      }

      function onWheel(e) {
        if (e.ctrlKey || !horizontal()) return;
        e.preventDefault();
        let d = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
        if (e.deltaMode === 1) d *= 16;
        else if (e.deltaMode === 2) d *= track.value.clientWidth;
        nudge(d);
      }

      function onDown(e) {
        if (!horizontal() || e.pointerType === 'touch' || e.button !== 0) return;
        down = true; dragging = false;
        startX = lastX = e.clientX;
        startScroll = track.value.scrollLeft;
        lastT = performance.now();
        vel = 0;
        cancelAnimationFrame(raf);
        animating = false;
      }

      function onMove(e) {
        if (!down) return;
        const dx = e.clientX - startX;
        if (!dragging) {
          if (Math.abs(dx) < 5) return;
          dragging = true;
          track.value.classList.add('is-dragging');
          try { track.value.setPointerCapture(e.pointerId); } catch (_) { /* ignore */ }
        }
        track.value.scrollLeft = startScroll - dx;
        const now = performance.now();
        const dt = Math.max(1, now - lastT);
        vel = vel * 0.6 + ((e.clientX - lastX) / dt) * 0.4;
        lastX = e.clientX;
        lastT = now;
      }

      function onUp(e) {
        if (!down) return;
        down = false;
        if (!dragging) return;
        try { track.value.releasePointerCapture(e.pointerId); } catch (_) { /* ignore */ }
        current = target = track.value.scrollLeft;
        nudge(-vel * 220);
        setTimeout(() => {
          dragging = false;
          if (track.value) track.value.classList.remove('is-dragging');
        }, 0);
      }

      function onKey(e) {
        if (e.key === 'ArrowRight') nudge(step());
        else if (e.key === 'ArrowLeft') nudge(-step());
      }

      function onScroll() {
        if (!animating && !dragging) current = target = track.value.scrollLeft;
        updateProgress();
      }

      // Clic sur un tableau : on crée le ghost avant que l'URL change.
      function onPick(e, p) {
        if (dragging) { e.preventDefault(); return; }
        if (REDUCED.matches || flip.pending) return;
        const img = e.currentTarget.querySelector('img');
        if (!img) return;
        preload(p);
        flip.pending = { slug: p.slug, ghost: makeGhost(img) };
        img.style.visibility = 'hidden';
      }

      // Au montage : on restaure le défilement et, si on revient d'une fiche, le tableau se repose dans la rangée.
      async function land() {
        await nextTick();
        const t = track.value;
        if (!t) return;
        t.scrollLeft = store.galleryScroll;
        current = target = t.scrollLeft;
        updateProgress();
        measureBar();
        if (fresh.value) freshTimer = setTimeout(() => { fresh.value = false; }, 80 + visible.value.length * 45 + 1000);

        const pend = flip.pending;
        if (!pend) return;
        flip.pending = null;
        const img = t.querySelector(`img[data-slug="${CSS.escape(pend.slug)}"]`);
        if (!img) { dropGhost(pend); return; }

        if (horizontal()) {
          const r = img.getBoundingClientRect();
          if (r.left < 0 || r.right > window.innerWidth) {
            const strip = t.querySelector('.strip');
            const gutter = strip ? parseFloat(getComputedStyle(strip).paddingLeft) || 0 : 0;
            t.scrollLeft += r.left - gutter;
            current = target = t.scrollLeft;
            updateProgress();
          }
        } else {
          const r = img.getBoundingClientRect();
          if (r.top < 0 || r.bottom > window.innerHeight) {
            window.scrollTo(0, window.scrollY + r.top - 80);
          }
        }
        img.style.visibility = 'hidden';
        flyGhost(pend.ghost, img, (release) => landOn(img, release));
      }

      let stopLoaded = null;

      onMounted(() => {
        view.value.addEventListener('wheel', onWheel, { passive: false });
        track.value.addEventListener('scroll', onScroll, { passive: true });
        window.addEventListener('keydown', onKey);
        window.addEventListener('resize', updateProgress);
        window.addEventListener('resize', measureBar);
        if (document.fonts && document.fonts.ready) document.fonts.ready.then(measureBar);
        if (store.loaded) land();
        else stopLoaded = watch(() => store.loaded, (ok) => { if (ok) land(); });
      });

      onBeforeUnmount(() => {
        if (stopLoaded) stopLoaded();
        cancelAnimationFrame(raf);
        clearTimeout(freshTimer);
        if (view.value) view.value.removeEventListener('wheel', onWheel);
        if (track.value) {
          track.value.removeEventListener('scroll', onScroll);
          store.galleryScroll = horizontal() ? track.value.scrollLeft : 0;
        }
        window.removeEventListener('keydown', onKey);
        window.removeEventListener('resize', updateProgress);
        window.removeEventListener('resize', measureBar);
      });

      return {
        store, view, track, filtersEl, progress, barStyle, fresh, visible, filters, fbarStyle,
        offset, sheetStyle, preload, imgSrc, imgSet, onDown, onMove, onUp, onPick, setFilter, holdPlace
      };
    }
  };

  /* ---------- Fiche d'un tableau ---------- */

  const DetailView = {
    props: { route: Object },
    template: '#tpl-detail',
    setup(props) {
      const panel = ref(null);
      const fit = reactive({ w: 0, h: 0 });
      const dir = ref(1);

      // On navigue dans la catégorie choisie ; si le tableau n'en fait pas partie (lien direct), dans tous les tableaux.
      const list = computed(() => (visible.value.some((x) => x.slug === props.route.slug) ? visible.value : store.paintings));
      const index = computed(() => list.value.findIndex((p) => p.slug === props.route.slug));
      const p = computed(() => (index.value >= 0 ? list.value[index.value] : null));
      const total = computed(() => list.value.length);
      const prev = computed(() => list.value[(index.value - 1 + total.value) % total.value]);
      const next = computed(() => list.value[(index.value + 1) % total.value]);
      const swapName = computed(() => (dir.value > 0 ? 'swap-next' : 'swap-prev'));
      const cats = computed(() => (p.value ? store.categories.filter((c) => hasTag(p.value, c.id)).map((c) => c.label).join(' · ') : ''));

      // Le tableau entier tient dans le panneau, marges comprises, en gardant ses proportions.
      function measure() {
        const el = panel.value;
        if (!el || !p.value) return;
        const cs = getComputedStyle(el);
        const innerW = el.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
        const innerH = el.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
        const r = p.value.w / p.value.h;
        const w = Math.max(0, Math.min(innerW, innerH * r));
        fit.w = w;
        fit.h = w / r;
      }

      const pieceStyle = computed(() => ({ width: `${fit.w}px`, height: `${fit.h}px` }));

      function openLightbox() { if (p.value) store.lightbox = p.value; }

      function go(target) { if (target) location.hash = '#/tableau/' + target.slug; }

      // Clavier : flèches gauche / droite (pas quand le plein écran est ouvert).
      function onKey(e) {
        if (store.lightbox || e.altKey || e.ctrlKey || e.metaKey) return;
        if (e.key === 'ArrowRight') { e.preventDefault(); go(next.value); }
        else if (e.key === 'ArrowLeft') { e.preventDefault(); go(prev.value); }
      }

      // Tactile : un balayage horizontal passe au tableau précédent ou suivant.
      // On ignore les bords de l'écran (geste « retour » du système), les gestes lents et ceux qui sont surtout verticaux (défilement).
      let swipe = null;
      function onTouchStart(e) {
        if (e.touches.length !== 1 || store.lightbox) { swipe = null; return; }
        const t = e.touches[0];
        const edge = t.clientX < 24 || t.clientX > window.innerWidth - 24;
        swipe = edge ? null : { x: t.clientX, y: t.clientY, t: performance.now() };
      }
      function onTouchEnd(e) {
        if (!swipe) return;
        const t = e.changedTouches[0];
        const dx = t.clientX - swipe.x;
        const dy = t.clientY - swipe.y;
        const dt = performance.now() - swipe.t;
        swipe = null;
        if (dt > 700 || Math.abs(dx) < 56 || Math.abs(dx) < Math.abs(dy) * 1.6) return;
        go(dx < 0 ? next.value : prev.value);
      }
      function onTouchCancel() { swipe = null; }

      let ro = null;

      // Le panneau n'existe qu'une fois les données chargées : en lien direct, il arrive après le montage.
      function observe() {
        if (ro || !panel.value) return;
        if ('ResizeObserver' in window) {
          ro = new ResizeObserver(measure);
          ro.observe(panel.value);
        } else {
          window.addEventListener('resize', measure);
        }
      }

      watch(() => store.loaded, async (ok) => {
        if (!ok) return;
        await nextTick();
        measure();
        observe();
      });

      onMounted(async () => {
        window.addEventListener('keydown', onKey);
        measure();
        observe();
        await nextTick();
        const pend = flip.pending;
        if (!pend) return;
        flip.pending = null;
        const piece = panel.value && panel.value.querySelector('.piece');
        const img = piece && piece.querySelector('img');
        if (p.value && pend.slug === p.value.slug && img) {
          img.style.visibility = 'hidden';
          flyGhost(pend.ghost, piece, (release) => landOn(img, release));
        } else {
          dropGhost(pend);
        }
      });

      onBeforeUnmount(() => {
        if (ro) ro.disconnect();
        window.removeEventListener('resize', measure);
        window.removeEventListener('keydown', onKey);
      });

      // Précédent / suivant : le sens du mouvement suit le sens dans la rangée.
      watch(index, (ni, oi) => {
        if (ni < 0 || oi < 0 || ni === oi) return;
        const n = total.value;
        const forward = (ni - oi + n) % n;
        dir.value = forward <= n / 2 ? 1 : -1;
        measure();
        if (next.value) preload(next.value);
        if (prev.value) preload(prev.value);
      });

      return {
        store, panel, p, index, total, prev, next, cats, swapName, pieceStyle, imgSrc, imgSet, insituSrc, insituSet,
        openLightbox, onTouchStart, onTouchEnd, onTouchCancel
      };
    }
  };

  /* ---------- À propos ---------- */

  const AboutView = {
    template: '#tpl-about',
    setup() {
      const root = ref(null);
      let io = null;

      onMounted(() => {
        const els = root.value.querySelectorAll('.reveal');
        if (REDUCED.matches || !('IntersectionObserver' in window)) {
          els.forEach((el) => el.classList.add('in'));
          return;
        }
        io = new IntersectionObserver((entries) => {
          entries.forEach((en) => {
            if (en.isIntersecting) { en.target.classList.add('in'); io.unobserve(en.target); }
          });
        }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });
        els.forEach((el) => io.observe(el));
      });

      onBeforeUnmount(() => { if (io) io.disconnect(); });

      return { root, photoSrc, photoSet, year: new Date().getFullYear() };
    }
  };

  /* ---------- Application ---------- */

  const App = {
    components: { SiteHeader, GalleryView, DetailView, AboutView },
    setup() {
      const route = reactive(parseHash());
      const components = { gallery: 'GalleryView', detail: 'DetailView', about: 'AboutView' };
      const viewComponent = computed(() => components[route.name]);

      // Intro : la signature s'écrit (2.15 s, voir les délais dans index.html), petite pause, puis fondu (CSS).
      // Une fois par session seulement, et pas si l'utilisateur préfère moins de mouvement.
      const INTRO_MS = 2150 + 450;
      const intro = ref(false);
      try {
        if (!REDUCED.matches && !sessionStorage.getItem('cc-intro')) {
          intro.value = true;
          sessionStorage.setItem('cc-intro', '1');
        }
      } catch (_) { /* stockage indisponible : pas d'intro */ }
      if (intro.value) setTimeout(() => { intro.value = false; }, INTRO_MS);

      function onHash() {
        const next = parseHash();
        // Retour de la fiche vers la galerie : le tableau repart vers sa place dans la rangée.
        if (route.name === 'detail' && next.name === 'gallery' && !REDUCED.matches && !flip.pending) {
          const img = document.querySelector('.view-detail .piece img');
          if (img) {
            flip.pending = { slug: route.slug, ghost: makeGhost(img) };
            img.style.visibility = 'hidden';
          }
        }
        if (flip.pending && next.name === 'about') { dropGhost(flip.pending); flip.pending = null; }
        route.name = next.name;
        route.slug = next.slug;
        store.lightbox = null;
      }

      // La vue qui s'en va reste figée à l'écran (position fixe) pendant son fondu.
      function beforeLeave(el) {
        el.style.top = `-${window.scrollY}px`;
        window.scrollTo(0, 0);
      }

      const title = computed(() => {
        if (route.name === 'about') return 'Christian Cailleau — À propos';
        if (route.name === 'detail') {
          const p = store.paintings.find((x) => x.slug === route.slug);
          return p ? `${p.title} — Christian Cailleau` : 'Christian Cailleau';
        }
        return 'Christian Cailleau — Les tableaux';
      });
      watch(title, (t) => { document.title = t; }, { immediate: true });

      watch(() => store.lightbox, (v) => { document.body.style.overflow = v ? 'hidden' : ''; });

      onMounted(async () => {
        window.addEventListener('hashchange', onHash);
        window.addEventListener('keydown', (e) => { if (e.key === 'Escape') store.lightbox = null; });

        const header = document.querySelector('.site-header');
        if (header) {
          const setH = () => document.documentElement.style.setProperty('--header-h', `${Math.ceil(header.getBoundingClientRect().height)}px`);
          setH();
          if ('ResizeObserver' in window) new ResizeObserver(setH).observe(header);
          else window.addEventListener('resize', setH);
        }

        try {
          const res = await fetch('data/paintings.json', { cache: 'no-cache' });
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const data = await res.json();
          store.paintings = Array.isArray(data) ? data : data.paintings;
          store.categories = !Array.isArray(data) && Array.isArray(data.categories) ? data.categories : [];
          const f = recallFilter();
          store.filter = filters.value.some((c) => c.id === f) ? f : 'tous';
          store.loaded = true;
        } catch (err) {
          store.error = String(err);
        }
      });

      return { route, store, viewComponent, beforeLeave, imgSrc, intro };
    }
  };

  createApp(App).mount('#app');
})();
