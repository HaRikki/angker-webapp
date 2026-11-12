/* AngKer Mini App — Tech UI, SVG icons */
(function () {
  const tg = window.Telegram?.WebApp;
  if (tg) {
    tg.ready();
    tg.expand();
    try { tg.setHeaderColor('#060a10'); tg.setBackgroundColor('#060a10'); } catch (_) {}
  }

  /** Telegram profile photo URL (if available) */
  function getTgPhotoUrl() {
    try {
      const u = tg?.initDataUnsafe?.user;
      if (u && u.photo_url) return u.photo_url;
    } catch (_) {}
    return null;
  }

  /** Set avatar element: photo if available, else letter */
  function setAvatarEl(el, letter) {
    if (!el) return;
    const photo = getTgPhotoUrl();
    const ch = (letter || 'U').toString().charAt(0).toUpperCase();
    if (photo) {
      el.classList.add('has-photo');
      el.style.backgroundImage = `url(${photo})`;
      el.textContent = '';
      // fallback if image fails
      const img = new Image();
      img.onerror = () => {
        el.classList.remove('has-photo');
        el.style.backgroundImage = '';
        el.textContent = ch;
      };
      img.src = photo;
    } else {
      el.classList.remove('has-photo');
      el.style.backgroundImage = '';
      el.textContent = ch;
    }
  }

  window.APP_LANG = 'km';
  let user = null;
  let servicesCache = null;
  let currentPlatform = null;
  let navStack = ['home'];
  let depositPollTimer = null;
  let selectedPkg = null;
  let currentService = null;
  let orderStatus = 'all';

  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];

  /** Strip emoji / symbols from backend text for clean labels */
  function stripEmoji(str) {
    if (!str) return '';
    return String(str)
      .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE00}-\u{FE0F}\u{200D}]/gu, '')
      .replace(/\s{2,}/g, ' ')
      .trim();
  }

  function icon(name, size) {
    if (typeof ICO === 'undefined' || !ICO[name]) return '';
    return ICO[name]({ size: size || 20 });
  }

  /** Fill all [data-ico] nodes in a root (or document) */
  function hydrateIcons(root) {
    const scope = root || document;
    scope.querySelectorAll('[data-ico]').forEach((el) => {
      const name = el.getAttribute('data-ico');
      const size = parseInt(el.getAttribute('data-size') || '20', 10);
      if (typeof ICO !== 'undefined' && ICO[name]) {
        el.innerHTML = ICO[name]({ size });
      }
    });
  }

  function toast(msg, ms = 2500) {
    const el = $('#toast');
    el.textContent = msg;
    el.classList.remove('hidden');
    setTimeout(() => el.classList.add('hidden'), ms);
  }

  function money(n) {
    return '$' + (Number(n) || 0).toFixed(2);
  }

  function statusBadge(st) {
    const s = (st || '').toLowerCase();
    let cls = 'badge-pending';
    let ico = 'clock';
    if (s.includes('complet') || s === 'success') { cls = 'badge-completed'; ico = 'check'; }
    else if (s.includes('process') || s.includes('progress')) { cls = 'badge-processing'; ico = 'activity'; }
    else if (s.includes('fail') || s.includes('cancel') || s.includes('error')) { cls = 'badge-failed'; ico = 'x'; }
    return `<span class="badge ${cls}">${icon(ico, 12)} ${st || '—'}</span>`;
  }

  window.__showPage = (...a) => showPage(...a);
  window.__toast = (...a) => toast(...a);
  function showPage(name, push = true) {
    $$('.page').forEach((p) => p.classList.remove('active'));
    const page = $(`#page-${name}`);
    if (page) page.classList.add('active');
    $$('.nav-item').forEach((b) => {
      const nav = b.dataset.nav;
      const active = nav === name || (name === 'orders' && nav === 'orders');
      b.classList.toggle('active', active);
    });
    if (push) {
      if (['home', 'services', 'orders', 'wallet', 'account', 'store', 'support', 'notifications'].includes(name)) {
        navStack = [name];
      } else if (navStack[navStack.length - 1] !== name) {
        navStack.push(name);
      }
    }
    if (name === 'home') loadHome();
    if (name === 'services') loadServices();
    if (name === 'store') loadStore();
    if (name === 'order') loadOrderPage();
    if (name === 'orders') loadOrders();
    if (name === 'wallet') loadWallet();
    if (name === 'notifications') loadNotifications();
    if (name === 'account') loadAccount();
    if (name === 'support') loadTickets();
    if (name === 'admin') loadAdminHome();
    if (name === 'admin-wa') loadAdminPlatforms();
    if (name === 'admin-wa-svc') loadAdminServices();
    if (name === 'admin-wa-edit') { /* filled by openAdminService */ }
    if (name === 'admin-full') loadAdminFullHub();
    if (name === 'admin-full-list') loadAdminFullList();
  }

  // ---------- ORDER PAGE (panel-style entry) ----------
  let orderPagePlatform = null;

  async function loadOrderPage() {
    const grid = $('#order-platform-grid');
    const list = $('#order-svc-list');
    if (!grid || !list) return;
    list.innerHTML = '<div class="skeleton"></div>';
    try {
      if (!servicesCache || !servicesCache.length) {
        const data = await API.getServices();
        servicesCache = data.platforms || [];
      }
      grid.innerHTML = '';
      const allBtn = document.createElement('button');
      allBtn.type = 'button';
      allBtn.className = 'plat-card p0 anim-btn';
      allBtn.innerHTML = `${icon('services', 18)} Everything`;
      allBtn.onclick = () => { orderPagePlatform = null; renderOrderSvcList(); };
      grid.appendChild(allBtn);
      (servicesCache || []).forEach((p, i) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'plat-card p' + ((i % 5) + 1) + ' anim-btn';
        b.innerHTML = `<span>${escapeHtml(stripEmoji(p.name) || p.key_name)}</span>`;
        b.onclick = () => { orderPagePlatform = p.key_name; renderOrderSvcList(); };
        grid.appendChild(b);
      });
      renderOrderSvcList();
      hydrateIcons(grid);
    } catch (e) {
      list.innerHTML = `<div class="empty">${icon('alert', 28)}<span>${escapeHtml(e.message)}</span></div>`;
    }
  }

  function renderOrderSvcList(q) {
    const list = $('#order-svc-list');
    if (!list) return;
    list.innerHTML = '';
    const qq = (q || ($('#order-svc-search') && $('#order-svc-search').value) || '').toLowerCase();
    let any = false;
    for (const p of servicesCache || []) {
      if (orderPagePlatform && p.key_name !== orderPagePlatform) continue;
      for (const s of p.services || []) {
        const name = stripEmoji(s.name || '');
        if (qq && !name.toLowerCase().includes(qq) && !String(s.id).includes(qq)) continue;
        any = true;
        const el = document.createElement('div');
        el.className = 'card anim-btn';
        el.style.cursor = 'pointer';
        el.innerHTML = `
          <div class="card-title">${escapeHtml(name)}</div>
          <div class="card-meta">
            <span>Min ${s.min_qty} · Max ${s.max_qty}</span>
            <span class="card-price">${money(s.min_price)}</span>
          </div>
        `;
        el.onclick = () => openService(s.id);
        list.appendChild(el);
      }
    }
    if (!any) list.innerHTML = `<div class="empty">${icon('inbox', 28)}<span>No services</span></div>`;
  }


  function goBack() {
    if (navStack.length > 1) {
      navStack.pop();
      showPage(navStack[navStack.length - 1], false);
    } else {
      showPage('home', false);
    }
  }

  // ---------- HOME ----------
  async function loadHome() {
    try { renderFavorites(); } catch (e) {}

    try {
      user = await API.getUser();
      window.APP_LANG = user.lang || 'km';
      const uname = user.username ? '@' + user.username : (user.first_name || 'User');
      const uid = user.user_id || user.id || '';
      if ($('#home-greeting')) $('#home-greeting').textContent = t('greeting');
      if ($('#home-username')) $('#home-username').textContent = uname;
      if ($('#home-userid')) $('#home-userid').textContent = uid ? ('ID: ' + uid) : 'ID: —';
      if ($('#home-balance')) $('#home-balance').textContent = money(user.balance);
      if ($('#home-orders-count')) $('#home-orders-count').textContent = String(user.total_orders || 0);
      if ($('#stat-total')) $('#stat-total').textContent = user.total_orders || 0;
      if ($('#stat-active')) $('#stat-active').textContent = user.active_orders || 0;
      if ($('#stat-done')) $('#stat-done').textContent = user.completed_orders || 0;
      const av = (user.first_name || user.username || 'U').charAt(0).toUpperCase();
      setAvatarEl($('#home-avatar'), av);
      setAvatarEl($('#acc-avatar'), av);
      const lh = $('#lang-select-home'); if (lh) lh.value = window.APP_LANG;
      const la = $('#lang-select'); if (la) la.value = window.APP_LANG;
      if (!servicesCache) {
        const data = await API.getServices();
        servicesCache = data.platforms || [];
      }
      const pop = $('#popular-services');
      pop.innerHTML = '';
      let count = 0;
      for (const p of servicesCache) {
        for (const s of (p.services || []).slice(0, 2)) {
          if (count >= 4) break;
          const el = document.createElement('div');
          el.className = 'card';
          el.innerHTML = `
            <div class="card-title">${escapeHtml(stripEmoji(s.name))}</div>
            <div class="card-meta"><span class="card-price">${money(s.min_price)}</span></div>
          `;
          el.onclick = () => openService(s.id);
          pop.appendChild(el);
          count++;
        }
      }
    } catch (e) {
      toast(e.message || t('error'));
    }
  }

  // ---------- SERVICES ----------
  
  // ===== SMM Order Panel state =====
  let smmPlatforms = [];
  let smmPlatformKey = null; // null = all
  let smmCategory = null;    // service object
  let smmPackage = null;     // package object
  let smmIsCustom = false;

  function smmUnitPrice(pkg) {
    if (!pkg) return 0;
    const bq = Number(pkg.quantity) || 1;
    return (Number(pkg.price) || 0) / bq;
  }

  function smmCalcCharge() {
    const el = $('#smm-charge');
    if (!el || !smmPackage) { if (el) el.textContent = '$0.00'; return 0; }
    let q = parseInt(($('#smm-qty') && $('#smm-qty').value) || '0', 10) || 0;
    const isRate = !!(smmPackage.is_rate || Number(smmPackage.id) === 0);
    if (!smmIsCustom && !isRate) {
      q = Number(smmPackage.quantity) || 1;
      if ($('#smm-qty')) $('#smm-qty').value = String(q);
    }
    let total;
    if (isRate || smmIsCustom) {
      const rate1k = Number((smmCategory && smmCategory.original_price) || smmPackage.price || 0);
      total = (q / 1000) * rate1k;
    } else if (q === Number(smmPackage.quantity)) {
      total = Number(smmPackage.price) || 0;
    } else {
      total = smmUnitPrice(smmPackage) * q;
    }
    total = Math.round(total * 100000) / 100000;
    el.textContent = money(total);
    return total;
  }

  function smmUpdateDetails() {
    const svc = smmCategory;
    const pkg = smmPackage;
    const set = (id, v) => { const e = $(id); if (e) e.textContent = v || '—'; };
    if (!svc) {
      set('#smm-ex-link', '—'); set('#smm-start', '—'); set('#smm-speed', '—');
      set('#smm-guarantee', '—'); set('#smm-avg', '—');
      const mb = $('#smm-more-body'); if (mb) mb.textContent = 'ជ្រើស Service ដើម្បីមើលព័ត៌មានលម្អិត';
      return;
    }
    set('#smm-ex-link', svc.example_link || svc.example || '—');
    set('#smm-start', svc.start_time || '0–10 min');
    set('#smm-speed', svc.speed || '—');
    set('#smm-guarantee', svc.guarantee || (svc.refill ? 'Yes' : 'No'));
    set('#smm-avg', svc.average_time || svc.avg_time || '—');
    const lines = [];
    if (svc.min_qty || svc.max_qty) lines.push('Min/Max: ' + (svc.min_qty || 1) + ' – ' + (svc.max_qty || '∞'));
    if (pkg) {
      const up = smmUnitPrice(pkg);
      lines.push('Rate: $' + (up * 1000).toFixed(4) + ' per 1000');
      lines.push(smmIsCustom ? 'Mode: Custom quantity' : 'Mode: Fixed package qty ' + pkg.quantity);
    }
    if (svc.description) lines.push(String(svc.description));
    const mb = $('#smm-more-body');
    if (mb) mb.innerHTML = lines.map((l) => '<div>' + escapeHtml(l) + '</div>').join('');
  }

  function smmApplyMode() {
    const qty = $('#smm-qty');
    const hint = $('#smm-qty-hint');
    if (!smmCategory || !smmPackage) {
      if (qty) { qty.value = ''; qty.readOnly = false; }
      if (hint) hint.textContent = 'Min: — – Max: —';
      smmIsCustom = false;
      smmCalcCharge();
      smmUpdateDetails();
      return;
    }
    const pkgs = smmCategory.packages || [];
    const minQ = Number(smmCategory.min_qty) || 1;
    const maxQ = Number(smmCategory.max_qty) || 100000;
    // Mode 2: rate package (is_rate / id 0) OR single package with wide min/max
    const isRate = !!(smmPackage && (smmPackage.is_rate || Number(smmPackage.id) === 0));
    smmIsCustom = isRate || (pkgs.length === 1 && minQ < maxQ && Number(pkgs[0].quantity || 0) > 0);
    if (smmIsCustom) {
      if (qty) { qty.readOnly = false; if (!qty.value) qty.value = String(minQ); }
      if (hint) hint.textContent = 'Min: ' + minQ + ' – Max: ' + maxQ;
    } else {
      if (qty) {
        qty.readOnly = true;
        qty.value = String(smmPackage.quantity || 1);
      }
      if (hint) hint.textContent = 'Fixed by Package · Qty ' + (smmPackage.quantity || 1);
    }
    smmCalcCharge();
    smmUpdateDetails();
  }

  function smmRenderPlatforms() {
    const grid = $('#platform-grid');
    if (!grid) return;
    grid.innerHTML = '';
    const all = document.createElement('button');
    all.type = 'button';
    all.className = 'plat-tile' + (smmPlatformKey == null ? ' active' : '');
    all.innerHTML = '<span class="plat-ico" data-ico="services" data-size="18"></span> Everythings';
    all.onclick = () => {
      smmPlatformKey = null; smmCategoryGroup = null; smmCategory = null; smmPackage = null;
      smmRenderPlatforms(); smmRenderCategoryBtn(); smmRenderServiceBtn(); smmApplyMode();
    };
    grid.appendChild(all);

    smmPlatforms.forEach((p) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'plat-tile' + (smmPlatformKey === (p.key_name || String(p.id)) ? ' active' : '');
      b.innerHTML = '<span class="plat-ico" data-ico="services" data-size="18"></span> ' + escapeHtml(stripEmoji(p.name || p.key_name || ''));
      b.onclick = () => {
        smmPlatformKey = p.key_name || String(p.id);
        smmCategoryGroup = null; smmCategory = null; smmPackage = null;
        smmRenderPlatforms(); smmRenderCategoryBtn(); smmRenderServiceBtn(); smmApplyMode();
      };
      grid.appendChild(b);
    });
  }

  // Menu hierarchy:
  //   Menu1 = Platform (TikTok, Telegram…)  → smmPlatformKey
  //   Menu2 = Category/group under platform → smmCategoryGroup
  //   Menu3 = Service under category        → smmCategory (service row) + packages

  let smmCategoryGroup = null; // Menu2 selected group name

  function smmFilteredServices() {
    const q = (($('#smm-search') && $('#smm-search').value) || '').toLowerCase().trim();
    let list = [];
    smmPlatforms.forEach((p) => {
      const key = p.key_name || String(p.id);
      if (smmPlatformKey != null && smmPlatformKey !== key && String(p.id) !== String(smmPlatformKey)) return;
      (p.services || []).forEach((s) => {
        const group = (s.group_name || s.name || 'General').trim() || 'General';
        const row = { ...s, group_name: group, platform_name: p.name, platform_key: key, packages: s.packages || [] };
        if (q) {
          const blob = ((s.name || '') + ' ' + group + ' ' + (p.name || '')).toLowerCase();
          if (!blob.includes(q)) return;
        }
        list.push(row);
      });
    });
    return list;
  }

  function smmUniqueGroups() {
    const seen = new Map();
    smmFilteredServices().forEach((s) => {
      const g = s.group_name || 'General';
      if (!seen.has(g)) seen.set(g, 0);
      seen.set(g, seen.get(g) + 1);
    });
    return Array.from(seen.entries()).map(([name, count]) => ({ name, count }));
  }

  function smmServicesInGroup(groupName) {
    return smmFilteredServices().filter((s) => (s.group_name || 'General') === groupName);
  }

  function smmRenderCategoryBtn() {
    // Menu2 — Category groups (not individual services)
    const text = $('#smm-category-text');
    if (text) text.textContent = smmCategoryGroup ? stripEmoji(smmCategoryGroup) : 'ជ្រើស Category...';
    const list = $('#smm-category-list');
    if (!list) return;
    list.innerHTML = '';
    const groups = smmUniqueGroups();
    if (!groups.length) {
      list.innerHTML = '<div class="smm-dd-empty">មិនមាន Category</div>';
      return;
    }
    groups.forEach((g) => {
      const item = document.createElement('button');
      item.type = 'button';
      item.className = 'smm-dd-item' + (smmCategoryGroup === g.name ? ' selected' : '');
      item.innerHTML = '<span class="smm-dd-ico" data-ico="services" data-size="16"></span> ' +
        escapeHtml(stripEmoji(g.name)) + ' <small style="opacity:.6">(' + g.count + ')</small>';
      item.onclick = () => {
        smmCategoryGroup = g.name;
        smmCategory = null;
        smmPackage = null;
        list.classList.add('hidden');
        smmRenderCategoryBtn();
        smmRenderServiceBtn();
        smmApplyMode();
      };
      list.appendChild(item);
    });
    if (typeof hydrateIcons === 'function') hydrateIcons(list);
  }

  function smmRenderServiceBtn() {
    // Menu3 — Services under selected Category (Menu2)
    const text = $('#smm-service-text');
    const list = $('#smm-service-list');
    if (!smmCategoryGroup) {
      if (text) text.textContent = 'ជ្រើស Service...';
      if (list) list.innerHTML = '<div class="smm-dd-empty">ជ្រើស Category មុន</div>';
      return;
    }
    const svcs = smmServicesInGroup(smmCategoryGroup);
    if (text) {
      if (smmCategory) {
        const rate = Number(smmCategory.original_price || 0);
        text.innerHTML = escapeHtml(stripEmoji(smmCategory.name || '')) +
          (rate ? ' · $' + rate.toFixed(4) + '/1K' : '');
      } else {
        text.textContent = 'ជ្រើស Service...';
      }
    }
    if (!list) return;
    list.innerHTML = '';
    if (!svcs.length) {
      list.innerHTML = '<div class="smm-dd-empty">មិនមាន Service</div>';
      return;
    }
    svcs.forEach((s) => {
      const item = document.createElement('button');
      item.type = 'button';
      item.className = 'smm-dd-item' + (smmCategory && String(smmCategory.id) === String(s.id) ? ' selected' : '');
      const rate = Number(s.original_price || 0);
      item.innerHTML = '<span class="smm-dd-ico" data-ico="package" data-size="16"></span> ' +
        escapeHtml(stripEmoji(s.name || '')) +
        (rate ? ' <small style="opacity:.7">$' + rate.toFixed(4) + '/1K</small>' : '');
      item.onclick = async () => {
        try {
          const full = await API.getService(s.id);
          let pkgs = full.packages || [];
          const r = Number(full.original_price || full.selling_price || 0);
          if ((!pkgs || !pkgs.length) && r > 0) {
            pkgs = [{
              id: 0,
              service_id: full.id,
              name: (full.name || 'Service') + ' - 1K = $' + r.toFixed(2),
              quantity: 1000,
              price: r,
              is_rate: true,
            }];
          }
          // Bot: multiple packages → keep packages as order options via qty/package mode
          smmCategory = { ...full, packages: pkgs, group_name: s.group_name };
          smmPackage = pkgs[0] || null;
        } catch (err) {
          smmCategory = s;
          smmPackage = (s.packages && s.packages[0]) || null;
          toast(err.message || 'Load failed');
        }
        list.classList.add('hidden');
        smmRenderServiceBtn();
        smmApplyMode();
      };
      list.appendChild(item);
    });
    if (typeof hydrateIcons === 'function') hydrateIcons(list);
  }

  async function loadServices() {
    try {
      const data = await API.getServices();
      smmPlatforms = data.platforms || data || [];
      if (!Array.isArray(smmPlatforms)) smmPlatforms = [];
      // ensure packages nested if API only returns services without packages - openService loads detail
      smmRenderPlatforms();
      if (typeof hydrateIcons === 'function') hydrateIcons(document.getElementById('platform-grid'));
      smmRenderCategoryBtn();
      smmRenderServiceBtn();
      smmApplyMode();

      // bind once
      if (!window._smmBound) {
        window._smmBound = true;
        $('#smm-category-btn')?.addEventListener('click', () => {
          const list = $('#smm-category-list');
          const other = $('#smm-service-list');
          if (other) other.classList.add('hidden');
          if (list) { list.classList.toggle('hidden'); if (!list.classList.contains('hidden')) smmRenderCategoryBtn(); }
        });
        $('#smm-service-btn')?.addEventListener('click', () => {
          const list = $('#smm-service-list');
          const other = $('#smm-category-list');
          if (other) other.classList.add('hidden');
          if (list) { list.classList.toggle('hidden'); if (!list.classList.contains('hidden')) smmRenderServiceBtn(); }
        });
        $('#smm-search')?.addEventListener('input', () => {
          smmRenderCategoryBtn();
        });
        $('#smm-qty')?.addEventListener('input', () => smmCalcCharge());
        $('#smm-submit')?.addEventListener('click', () => {
          if (!smmCategory || !smmPackage) return toast('ជ្រើស Category និង Service');
          const link = (($('#smm-link') && $('#smm-link').value) || '').trim();
          if (!link || link.length < 3) return toast('បញ្ចូល Link');
          const minQ = Number(smmCategory.min_qty) || 1;
          const maxQ = Number(smmCategory.max_qty) || 100000;
          let qty;
          if (smmIsCustom) {
            qty = parseInt(($('#smm-qty') && $('#smm-qty').value) || '0', 10);
            if (!qty || qty < minQ || qty > maxQ) return toast('Quantity ត្រូវនៅ ' + minQ + ' – ' + maxQ);
          } else {
            qty = Number(smmPackage.quantity) || 1;
          }
          const total = smmCalcCharge();
          if (user && Number(user.balance) < total) return toast('សមតុល្យមិនគ្រប់ — ត្រូវ ' + money(total));
          currentService = smmCategory;
          openOrderConfirm(smmPackage, link, qty, smmIsCustom);
        });
      }
    } catch (e) {
      const grid = $('#platform-grid');
      if (grid) grid.innerHTML = '<div class="empty">' + escapeHtml(e.message) + '</div>';
    }
  }

  async function openService(id) {
    showPage('service-detail');
    const body = $('#svc-detail-body');
    body.innerHTML = '<div class="skeleton"></div>';
    try {
      currentService = await API.getService(id);
      $('#svc-detail-title').textContent = stripEmoji(currentService.name);
      const pkgs = currentService.packages || [];
      selectedPkg = pkgs[0] || null;
      const minQ = Number(currentService.min_qty) || 1;
      const maxQ = Number(currentService.max_qty) || 100000;

      // Mode 1 (Fixed): Admin set packages with qty+price → user cannot change qty
      // Mode 2 (Custom): single rate package + Min < Max → user sets qty
      const isCustomMode = pkgs.length === 1 && minQ < maxQ && Number(pkgs[0].quantity || 0) > 0;
      const isFixedMode = !isCustomMode && pkgs.length >= 1;

      body.innerHTML = `
        <div class="order-form smm-panel">
          <div class="of-tabs">
            <button type="button" class="of-tab active anim-btn">${icon('cart', 16)} <span class="anim-icon-wrap">${icon('cart', 16)}</span> New Order</button>
            <button type="button" class="of-tab of-tab-muted" disabled>Mass order</button>
          </div>

          <div class="of-search">
            <span class="search-ico" data-ico="search" data-size="16"></span>
            <input type="search" class="input" id="order-pkg-filter" placeholder="Search package..." autocomplete="off" />
          </div>

          <label class="of-label">${icon('services', 14)} Category</label>
          <div class="of-card of-svc-name anim-btn">${escapeHtml(stripEmoji(currentService.name))}</div>

          <label class="of-label">${icon('package', 14)} Service / Package</label>
          <div class="pkg-select" id="pkg-select"></div>

          <label class="of-label">${icon('link', 14)} Link</label>
          <input class="input" id="order-link" type="url" placeholder="https://… / @username / t.me/…" autocomplete="off" />

          <label class="of-label">${icon('activity', 14)} Quantity
            <span class="of-badge ${isCustomMode ? 'badge-custom' : 'badge-fixed'}">
              ${isCustomMode ? 'Custom (Min ' + minQ + ' – Max ' + maxQ + ')' : 'Fixed by Package'}
            </span>
          </label>
          <input class="input" id="order-qty" type="number" inputmode="numeric"
            ${isFixedMode || !isCustomMode ? 'readonly' : ''}
            min="${minQ}" max="${maxQ}" />

          <div class="of-charge-row anim-float">
            <span>Charge</span>
            <strong id="order-charge">$0.00</strong>
          </div>
          <div class="of-balance-row">Balance: <strong id="order-bal">${money(user?.balance)}</strong></div>

          <button class="btn btn-submit-order btn-block anim-btn" id="btn-to-confirm" type="button">
            <span class="anim-icon-wrap">${icon('check', 18)}</span> Submit Order
          </button>

          <div class="of-details">
            <div class="of-details-title">More Details</div>
            <div class="of-detail-line"><span>Min / Max</span><span>${minQ} – ${maxQ}</span></div>
            <div class="of-detail-line"><span>Mode</span><span>${isCustomMode ? '② User sets quantity' : '① Fixed package'}</span></div>
            <p class="of-note" id="order-mode-note"></p>
          </div>
        </div>
      `;
      hydrateIcons(body);

      const pkgSelect = $('#pkg-select');
      const qtyInput = $('#order-qty');
      const chargeEl = $('#order-charge');
      const noteEl = $('#order-mode-note');

      function unitPrice(pkg) {
        const bq = Number(pkg.quantity) || 1;
        return (Number(pkg.price) || 0) / bq;
      }

      function calcCharge() {
        if (!selectedPkg) { chargeEl.textContent = '$0.00'; return 0; }
        let q;
        if (isCustomMode) {
          q = parseInt(qtyInput.value, 10) || 0;
        } else {
          q = Number(selectedPkg.quantity) || 1;
          qtyInput.value = String(q);
        }
        let total;
        if (!isCustomMode && q === Number(selectedPkg.quantity)) {
          total = Number(selectedPkg.price) || 0;
        } else {
          total = unitPrice(selectedPkg) * q;
        }
        total = Math.round(total * 10000) / 10000;
        chargeEl.textContent = money(total);
        return total;
      }

      function renderPkgs(filter) {
        pkgSelect.innerHTML = '';
        const qq = (filter || '').toLowerCase();
        const list = pkgs.filter((pkg) => {
          if (!qq) return true;
          return String(pkg.name || '').toLowerCase().includes(qq) || String(pkg.id).includes(qq);
        });
        if (!list.length) {
          pkgSelect.innerHTML = `<div class="empty">មិនមាន Package</div>`;
          return;
        }
        list.forEach((pkg, idx) => {
          const item = document.createElement('button');
          item.type = 'button';
          const selected = selectedPkg && String(selectedPkg.id) === String(pkg.id);
          item.className = 'pkg-item anim-btn' + (selected ? ' selected' : '');
          item.dataset.id = pkg.id;
          const up = unitPrice(pkg);
          const per1k = (up * 1000).toFixed(4);
          item.innerHTML = `
            <div class="pkg-item-top">
              <span class="pkg-id anim-icon-wrap">${pkg.id}</span>
              <span class="pkg-name">${escapeHtml(stripEmoji(pkg.name))}</span>
            </div>
            <div class="pkg-item-meta">
              ${isCustomMode
                ? `$${per1k} / 1000 · Qty ${minQ}–${maxQ}`
                : `Qty <b>${pkg.quantity}</b> · <b class="card-price">${money(pkg.price)}</b>`}
            </div>
          `;
          item.onclick = () => {
            selectedPkg = pkgs.find((x) => String(x.id) === item.dataset.id);
            renderPkgs($('#order-pkg-filter')?.value);
            if (isFixedMode && selectedPkg) {
              qtyInput.value = String(selectedPkg.quantity || 1);
              qtyInput.readOnly = true;
            }
            calcCharge();
          };
          pkgSelect.appendChild(item);
        });
      }

      if (!pkgs.length) {
        pkgSelect.innerHTML = `<div class="empty">មិនមាន Package — Admin ត្រូវបង្កើត Package</div>`;
        noteEl.textContent = 'សេវានេះមិនទាន់មាន Package។';
      } else {
        if (isFixedMode && selectedPkg) {
          qtyInput.value = String(selectedPkg.quantity || 1);
          qtyInput.readOnly = true;
          noteEl.textContent = 'របៀបទី ①: ចំនួន+តម្លៃកំណត់តាម Package — បញ្ចូលតែ Link រួច Submit។';
        } else if (isCustomMode && selectedPkg) {
          qtyInput.value = String(minQ);
          qtyInput.readOnly = false;
          noteEl.textContent = 'របៀបទី ②: អ្នកកំណត់ចំនួនក្នុង Min–Max — តម្លៃគណនាតាមអត្រា។';
        }
        renderPkgs();
        calcCharge();
      }

      $('#order-pkg-filter')?.addEventListener('input', (e) => renderPkgs(e.target.value.trim()));
      qtyInput.addEventListener('input', calcCharge);

      $('#btn-to-confirm').onclick = () => {
        if (!selectedPkg) return toast('ជ្រើស Package');
        const link = ($('#order-link').value || '').trim();
        if (!link || link.length < 3) return toast('បញ្ចូល Link');
        let qty;
        if (isCustomMode) {
          qty = parseInt(qtyInput.value, 10);
          if (!qty || qty < minQ || qty > maxQ) {
            return toast(`Quantity ត្រូវនៅចន្លោះ ${minQ} – ${maxQ}`);
          }
        } else {
          qty = Number(selectedPkg.quantity) || 1;
        }
        const total = calcCharge();
        if (user && Number(user.balance) < total) {
          return toast(`សមតុល្យមិនគ្រប់ — ត្រូវ ${money(total)}`);
        }
        openOrderConfirm(selectedPkg, link, qty, isCustomMode);
      };
    } catch (e) {
      body.innerHTML = `<div class="empty">${icon('alert', 28)}<span>${escapeHtml(e.message)}</span></div>`;
    }
  }

  function openOrderConfirm(pkg, link, qty, isCustom) {
    showPage('order-confirm');
    const body = $('#order-confirm-body');
    const q = qty || pkg.quantity || 1;
    const baseQty = Number(pkg.quantity) || 1;
    let total = Number(pkg.price) || 0;
    if (q !== baseQty) {
      total = Math.round(((Number(pkg.price) || 0) / baseQty) * q * 10000) / 10000;
    }
    body.innerHTML = `
      <div class="card" style="cursor:default">
        <div class="card-title">${escapeHtml(stripEmoji(currentService?.name || ''))}</div>
        <div class="card-meta" style="flex-direction:column;gap:8px;margin-top:10px;align-items:flex-start">
          <div>Package: <strong>${escapeHtml(stripEmoji(pkg.name))}</strong></div>
          <div>Link: <strong style="word-break:break-all">${escapeHtml(link)}</strong></div>
          <div>Quantity: <strong>${q}</strong> ${isCustom ? '(custom)' : '(fixed)'}</div>
          <div>Charge: <strong class="card-price">${money(total)}</strong></div>
          <div>Balance: <strong>${money(user?.balance)}</strong></div>
        </div>
      </div>
      <button class="btn btn-primary btn-block" id="btn-place-order" type="button" style="margin-top:16px">
        ${icon('check', 16)} ${t('placeOrder')}
      </button>
    `;
    $('#btn-place-order').onclick = async () => {
      const btn = $('#btn-place-order');
      btn.disabled = true;
      btn.textContent = t('loading');
      try {
        try { if (smmCategory) toggleFav({ id: smmCategory.id, name: smmCategory.name }); } catch(e) {}
        const res = await API.createOrder({
          package_id: Number(pkg.id) || 0,
          service_id: (Number(pkg.id) === 0 || pkg.is_rate) ? (currentService && currentService.id) : undefined,
          link,
          quantity: q,
        });
        // tiktok_khmer / tiktok_khmer2 → QR sent to Telegram Bot (same as bot)
        if (res.payment_mode === 'qr' || res.status === 'AwaitingPayment') {
          const msg = res.message_km || res.message_en
            || 'QR បានផ្ញើទៅ Bot។ សូមស្កេនក្នុង Telegram ដើម្បីទូទាត់។';
          toast(msg, 4000);
          try {
            if (window.Telegram?.WebApp?.close) {
              // optional: keep miniapp open so user sees toast
            }
          } catch (_) {}
          showPage('orders');
          if (typeof loadOrders === 'function') loadOrders();
        } else {
          toast(t('success') + ' #' + (res.order_id || res.id || ''));
          user = await API.getUser();
          showPage('orders');
          if (typeof loadOrders === 'function') loadOrders();
        }
      } catch (e) {
        toast(e.message);
        btn.disabled = false;
        btn.innerHTML = `${icon('check', 16)} ${t('placeOrder')}`;
      }
    };
  }

  // ---------- STORE ----------
  function mediaUrl(fileId) {
    if (!fileId) return '';
    const init = (typeof API !== 'undefined' && API.getInitData) ? API.getInitData() : '';
    let url = '/api/media?file_id=' + encodeURIComponent(fileId);
    if (init) url += '&initData=' + encodeURIComponent(init);
    return url;
  }

  async function loadStore() {
    const list = $('#products-list');
    list.className = 'product-grid';
    list.innerHTML = '<div class="skeleton"></div><div class="skeleton"></div>';
    try {
      const data = await API.getProducts();
      list.innerHTML = '';
      (data.products || []).forEach((p) => {
        const el = document.createElement('div');
        el.className = 'product-card';
        const imgId = p.image_file_id || '';
        const minPrice = (p.packages || []).length
          ? Math.min(...(p.packages || []).map((x) => Number(x.price) || 0))
          : 0;
        const thumb = imgId
          ? `<img class="thumb" src="${mediaUrl(imgId)}" alt="" loading="lazy" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'" /><div class="thumb-placeholder" style="display:none">${icon('store', 28)}</div>`
          : `<div class="thumb-placeholder">${icon('store', 28)}</div>`;
        el.innerHTML = `
          ${thumb}
          <div class="pc-body">
            <div class="pc-name">${escapeHtml(stripEmoji(p.name))}</div>
            <div class="pc-meta">
              <span>Stock ${p.stock}</span>
              <span class="pc-price">${minPrice ? money(minPrice) : '—'}</span>
            </div>
          </div>
        `;
        el.onclick = () => openProduct(p.id);
        list.appendChild(el);
      });
      if (!(data.products || []).length) {
        list.className = 'list';
        list.innerHTML = `<div class="empty">${icon('store', 28)}<span>No products</span></div>`;
      }

      const dol = $('#digital-orders-list');
      const dord = await API.getDigitalOrders();
      dol.innerHTML = '';
      (dord.orders || []).forEach((o) => {
        const el = document.createElement('div');
        el.className = 'card';
        el.style.cursor = 'default';
        el.innerHTML = `
          <div class="card-title">${escapeHtml(stripEmoji(o.product_name))} — ${escapeHtml(stripEmoji(o.package_name))}</div>
          <div class="card-meta">
            ${statusBadge(o.status)}
            <span class="card-price">${money(o.total_price)}</span>
            <span>#${o.order_id}</span>
          </div>
          <div style="font-size:12px;color:var(--muted);margin-top:6px">
            Delivery: Telegram Bot
          </div>
        `;
        dol.appendChild(el);
      });
    } catch (e) {
      list.className = 'list';
      list.innerHTML = `<div class="empty">${icon('alert', 28)}<span>${escapeHtml(e.message)}</span></div>`;
    }
  }

  async function openProduct(id) {
    showPage('product-detail');
    const body = $('#prod-detail-body');
    body.innerHTML = '<div class="skeleton"></div>';
    try {
      const p = await API.getProduct(id);
      $('#prod-detail-title').textContent = stripEmoji(p.name);
      const prodImg = p.image_file_id || '';
      const pkgs = p.packages || [];
      let selectedId = pkgs[0] ? pkgs[0].id : null;
      let qty = 1;
      let step = pkgs.length ? 'list' : 'empty'; // list | detail

      function renderList() {
        step = 'list';
        const cards = pkgs.map((pk) => {
          const st = Number(pk.available_stock) || 0;
          const pkgImg = pk.image_file_id || '';
          return `<button type="button" class="pkg-card anim-btn" data-pkg="${pk.id}">
            ${pkgImg ? `<img class="pkg-card-img" src="${mediaUrl(pkgImg)}" alt="" loading="lazy" onerror="this.style.display='none'" />` : `<div class="pkg-card-img ph">${icon('package', 28)}</div>`}
            <div class="pkg-card-body">
              <div class="pkg-card-name">${escapeHtml(stripEmoji(pk.name))}</div>
              <div class="pkg-card-meta"><span class="card-price">${money(pk.price)}</span> · Stock ${st}</div>
            </div>
          </button>`;
        }).join('');
        body.innerHTML = `
          ${prodImg ? `<img class="prod-hero" src="${mediaUrl(prodImg)}" alt="" loading="lazy" onerror="this.style.display='none'" />` : ''}
          <div class="section-title">Package</div>
          <div class="pkg-cards">${cards || '<div class="empty">មិនមាន Package</div>'}</div>
        `;
        body.querySelectorAll('[data-pkg]').forEach((btn) => {
          btn.onclick = () => {
            selectedId = Number(btn.getAttribute('data-pkg'));
            qty = 1;
            renderDetail();
          };
        });
      }

      function renderDetail() {
        step = 'detail';
        const sel = pkgs.find((x) => String(x.id) === String(selectedId)) || pkgs[0];
        if (!sel) { renderList(); return; }
        const maxQ = Math.max(1, Number(sel.available_stock) || 0);
        if (qty > maxQ) qty = maxQ || 1;
        if (qty < 1) qty = 1;
        const unit = Number(sel.price) || 0;
        const total = unit * qty;
        const pkgImg = sel.image_file_id || '';
        const stockImgs = (sel.stock_images || []).filter(Boolean);
        const desc = (sel.description || p.description || '').trim();
        const gallery = stockImgs.length
          ? `<div class="stock-gallery">${stockImgs.map((fid) =>
              `<img class="stock-thumb" src="${mediaUrl(fid)}" alt="" loading="lazy" onerror="this.style.display='none'" />`
            ).join('')}</div>`
          : '';

        body.innerHTML = `
          <button type="button" class="btn btn-ghost" id="pkg-back-list" style="margin-bottom:10px">${icon('arrowLeft', 16)} ត្រលប់ Package</button>
          ${pkgImg ? `<img class="prod-hero" src="${mediaUrl(pkgImg)}" alt="" loading="lazy" onerror="this.style.display='none'" />` : (prodImg ? `<img class="prod-hero" src="${mediaUrl(prodImg)}" alt="" loading="lazy" onerror="this.style.display='none'" />` : '')}
          ${gallery}
          <div class="card" style="cursor:default;margin-bottom:12px">
            <div class="card-title">${escapeHtml(stripEmoji(sel.name))}</div>
            <div class="card-meta" style="flex-direction:column;align-items:flex-start;gap:6px;margin-top:8px">
              <div>💰 តម្លៃ: <b class="card-price">${money(unit)}</b></div>
              <div>📦 ស្តុកនៅសល់: <b>${maxQ}</b></div>
            </div>
            ${desc ? `<div class="of-note" style="margin-top:10px;white-space:pre-wrap">${escapeHtml(desc)}</div>` : ''}
          </div>
          <label class="of-label">ចំនួនដែលចង់ទិញ</label>
          <div class="qty-row">
            <button type="button" class="qty-btn" id="qty-minus">−</button>
            <input class="input qty-input" id="dig-qty" type="number" inputmode="numeric" value="${qty}" min="1" max="${maxQ}" />
            <button type="button" class="qty-btn" id="qty-plus">+</button>
          </div>
          <div class="of-charge-row" style="margin-top:12px"><span>សរុប</span><strong id="dig-total">${money(total)}</strong></div>
          <div class="of-balance-row">Balance: <strong>${money(user?.balance)}</strong></div>
          <button class="btn btn-primary btn-block anim-btn" id="btn-pay-balance" type="button" style="margin-top:14px" ${maxQ < 1 ? 'disabled' : ''}>
            ${icon('wallet', 18)} បង់លុយក្នុងគណនី
          </button>
          <button class="btn btn-ghost btn-block" id="btn-pay-khqr" type="button" style="margin-top:8px" ${maxQ < 1 ? 'disabled' : ''}>
            ${icon('qr', 18)} បង់តាម KHQR
          </button>
        `;

        const syncTotal = () => {
          const q = parseInt(($('#dig-qty') && $('#dig-qty').value) || '1', 10) || 1;
          qty = Math.min(maxQ, Math.max(1, q));
          if ($('#dig-qty')) $('#dig-qty').value = String(qty);
          if ($('#dig-total')) $('#dig-total').textContent = money(unit * qty);
        };
        $('#pkg-back-list')?.addEventListener('click', renderList);
        $('#qty-minus')?.addEventListener('click', () => { qty = Math.max(1, qty - 1); syncTotal(); });
        $('#qty-plus')?.addEventListener('click', () => { qty = Math.min(maxQ, qty + 1); syncTotal(); });
        $('#dig-qty')?.addEventListener('input', syncTotal);

        async function doBuy(method) {
          syncTotal();
          if (maxQ < 1) return toast('អស់ស្តុក');
          if (method === 'balance' && user && Number(user.balance) < unit * qty) {
            return toast('សមតុល្យមិនគ្រប់');
          }
          const btnB = $('#btn-pay-balance');
          const btnK = $('#btn-pay-khqr');
          try {
            if (btnB) btnB.disabled = true;
            if (btnK) btnK.disabled = true;
            const res = await API.buyDigital(sel.id, qty, method);
            toast(t('success') + (res.order_id ? ' #' + res.order_id : ''));
            user = await API.getUser();
            if (method === 'khqr' && res.payment_id) {
              showPage('wallet');
            } else {
              showPage('orders');
            }
          } catch (err) {
            toast(err.message || 'Error');
          } finally {
            if (btnB) btnB.disabled = false;
            if (btnK) btnK.disabled = false;
          }
        }
        $('#btn-pay-balance')?.addEventListener('click', () => doBuy('balance'));
        $('#btn-pay-khqr')?.addEventListener('click', () => doBuy('khqr'));
      }

      if (!pkgs.length) {
        body.innerHTML = `
          ${prodImg ? `<img class="prod-hero" src="${mediaUrl(prodImg)}" alt="" loading="lazy" onerror="this.style.display='none'" />` : ''}
          <div class="empty">${icon('package', 28)}<span>មិនមាន Package</span></div>`;
      } else {
        renderList();
      }
    } catch (e) {
      body.innerHTML = `<div class="empty">${icon('alert', 28)}<span>${escapeHtml(e.message)}</span></div>`;
    }
  }

  
  // ========== FEATURES: Favorites, Search, Notif, Mass, Copy, Delivery ==========
  const FAV_KEY = 'harikki_fav_services';
  function getFavs() {
    try { return JSON.parse(localStorage.getItem(FAV_KEY) || '[]'); } catch { return []; }
  }
  function saveFavs(arr) {
    localStorage.setItem(FAV_KEY, JSON.stringify(arr.slice(0, 30)));
  }
  function toggleFav(svc) {
    if (!svc || !svc.id) return;
    let favs = getFavs();
    const i = favs.findIndex((x) => String(x.id) === String(svc.id));
    if (i >= 0) favs.splice(i, 1);
    else favs.unshift({ id: svc.id, name: svc.name, platform: svc.platform || '' });
    saveFavs(favs);
    renderFavorites();
    toast(i >= 0 ? 'Removed favorite' : '⭐ Saved favorite');
  }
  function renderFavorites() {
    const sec = $('#favorites-section');
    const list = $('#favorites-list');
    if (!sec || !list) return;
    const favs = getFavs();
    if (!favs.length) { sec.classList.add('hidden'); return; }
    sec.classList.remove('hidden');
    list.innerHTML = favs.map((f) =>
      `<button type="button" class="chip fav-chip" data-fav="${f.id}">${escapeHtml(stripEmoji(f.name || ''))}</button>`
    ).join('');
    list.querySelectorAll('[data-fav]').forEach((btn) => {
      btn.onclick = () => {
        showPage('services');
        // try open service
        const id = Number(btn.getAttribute('data-fav'));
        if (typeof openService === 'function') openService(id);
        else if (typeof loadServiceDetail === 'function') loadServiceDetail(id);
      };
    });
  }

  function copyText(text) {
    const s = String(text || '');
    if (!s) return;
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(s).then(() => toast('Copied')).catch(() => fallbackCopy(s));
    } else fallbackCopy(s);
  }
  function fallbackCopy(s) {
    const ta = document.createElement('textarea');
    ta.value = s; document.body.appendChild(ta); ta.select();
    try { document.execCommand('copy'); toast('Copied'); } catch { toast(s); }
    document.body.removeChild(ta);
  }

  async function runGlobalSearch(q) {
    const box = $('#search-results');
    if (!box) return;
    q = (q || '').trim();
    if (q.length < 1) { box.classList.add('hidden'); box.innerHTML = ''; return; }
    box.classList.remove('hidden');
    box.innerHTML = '<div class="skeleton"></div>';
    try {
      const data = await API.search(q);
      const parts = [];
      (data.services || []).forEach((s) => {
        parts.push(`<button type="button" class="card" data-stype="service" data-sid="${s.id}">
          <div class="card-title">${escapeHtml(s.name || '')}</div>
          <div class="card-meta">Service · ${escapeHtml(s.platform || '')}</div>
        </button>`);
      });
      (data.products || []).forEach((p) => {
        parts.push(`<button type="button" class="card" data-stype="product" data-sid="${p.id}">
          <div class="card-title">${escapeHtml(p.name || '')}</div>
          <div class="card-meta">Store</div>
        </button>`);
      });
      box.innerHTML = parts.length ? parts.join('') : `<div class="empty">No results</div>`;
      box.querySelectorAll('[data-sid]').forEach((el) => {
        el.onclick = () => {
          const id = Number(el.getAttribute('data-sid'));
          const ty = el.getAttribute('data-stype');
          box.classList.add('hidden');
          if (ty === 'product') { showPage('store'); openProduct(id); }
          else { showPage('services'); if (typeof openService === 'function') openService(id); }
        };
      });
    } catch (e) {
      box.innerHTML = `<div class="empty">${escapeHtml(e.message)} <button type="button" class="btn btn-outline" id="search-retry">Retry</button></div>`;
      $('#search-retry')?.addEventListener('click', () => runGlobalSearch(q));
    }
  }

  async function loadNotifications() {
    const list = $('#notif-list');
    if (!list) return;
    list.innerHTML = '<div class="skeleton"></div>';
    try {
      const data = await API.getNotifications();
      const items = data.notifications || [];
      // local order-change notices
      const local = JSON.parse(localStorage.getItem('harikki_local_notif') || '[]');
      const all = [...local, ...items].slice(0, 40);
      if (!all.length) {
        list.innerHTML = `<div class="empty">${icon('bell', 28)}<span>មិនមានការជូនដំណឹង</span></div>`;
        return;
      }
      list.innerHTML = all.map((n) => `
        <div class="card" style="cursor:default">
          <div class="card-title">${escapeHtml(n.title || n.text || 'Notice')}</div>
          <div class="card-meta">${escapeHtml(n.body || n.message || '')}</div>
        </div>`).join('');
    } catch (e) {
      list.innerHTML = `<div class="empty">${escapeHtml(e.message)}</div>`;
    }
  }

  function pushLocalNotif(title, body) {
    try {
      const arr = JSON.parse(localStorage.getItem('harikki_local_notif') || '[]');
      arr.unshift({ title, body, ts: Date.now() });
      localStorage.setItem('harikki_local_notif', JSON.stringify(arr.slice(0, 30)));
    } catch {}
  }

  // Order status polling
  let lastOrderSig = '';
  async function pollOrderStatus() {
    try {
      const data = await API.getOrders('all');
      const orders = data.orders || data || [];
      const sig = orders.slice(0, 20).map((o) => (o.order_id || o.id) + ':' + (o.status || '')).join('|');
      if (lastOrderSig && sig !== lastOrderSig) {
        toast('📦 Order status updated');
        pushLocalNotif('Order update', 'ស្ថានភាព order បានផ្លាស់ប្តូរ');
        if (typeof loadOrders === 'function') loadOrders();
      }
      lastOrderSig = sig;
    } catch {}
  }
  setInterval(pollOrderStatus, 45000);

  // Enhance order card HTML helper used if renderOrdersList exists
  window._orderCardExtra = function(o) {
    const oid = o.order_id || o.id || '';
    const link = o.link || '';
    return `<div class="row-flex" style="gap:6px;margin-top:8px">
      <button type="button" class="btn btn-outline btn-sm copy-oid" data-c="${escapeHtml(oid)}">Copy ID</button>
      ${link ? `<button type="button" class="btn btn-outline btn-sm copy-link" data-c="${escapeHtml(link)}">Copy Link</button>` : ''}
    </div>`;
  };

  async function loadDigitalOrdersPanel() {
    const list = $('#digital-orders-list');
    if (!list) return;
    try {
      const data = await API.getDigitalOrders();
      const rows = data.orders || data || [];
      if (!rows.length) {
        list.innerHTML = `<div class="empty">${icon('package', 24)}<span>មិនមាន Digital Order</span></div>`;
        return;
      }
      list.innerHTML = rows.map((o) => {
        const content = o.delivered_content || '';
        const st = o.status || '';
        return `<div class="card" style="cursor:default">
          <div class="card-title">${escapeHtml(o.package_name || o.product_name || 'Digital')}</div>
          <div class="card-meta">${statusBadge(st)} · ${money(o.total_price)} · #${escapeHtml(o.order_id || '')}</div>
          ${content ? `<pre class="delivery-box">${escapeHtml(content)}</pre>
            <button type="button" class="btn btn-outline btn-block copy-deliv" data-c="${escapeHtml(content)}" style="margin-top:6px">Copy Account</button>` : ''}
        </div>`;
      }).join('');
      list.querySelectorAll('.copy-deliv').forEach((b) => b.onclick = () => copyText(b.getAttribute('data-c')));
    } catch (e) {
      list.innerHTML = `<div class="empty">${escapeHtml(e.message)}</div>`;
    }
  }

  // Wire feature UI after DOM ready - call from existing boot
  function bindFeatureUI() {
    const gs = $('#global-search');
    let st = null;
    gs?.addEventListener('input', () => {
      clearTimeout(st);
      st = setTimeout(() => runGlobalSearch(gs.value), 350);
    });
    $('#btn-notif')?.addEventListener('click', () => { showPage('notifications'); loadNotifications(); });
    $('#btn-promo')?.addEventListener('click', async () => {
      const code = ($('#promo-code')?.value || '').trim();
      if (!code) return toast('បញ្ចូល code');
      try {
        const res = await API.applyPromo(code);
        toast(res.message_km || res.message_en || 'OK +$' + res.bonus);
        if (res.balance != null && user) user.balance = res.balance;
        loadWallet();
        loadHome();
      } catch (e) { toast(e.message); }
    });
    $('#btn-mass-order')?.addEventListener('click', async () => {
      const raw = ($('#mass-links')?.value || '').trim();
      const links = raw.split(/\n+/).map((x) => x.trim()).filter(Boolean);
      if (!links.length) return toast('ដាក់ Link');
      if (!smmCategory) return toast('ជ្រើស Service សិន');
      const pkgId = smmPackage ? (smmPackage.id || 0) : 0;
      const qty = parseInt(($('#smm-qty')?.value || smmPackage?.quantity || '1'), 10) || 1;
      const btn = $('#btn-mass-order');
      if (btn) btn.disabled = true;
      const box = $('#mass-result');
      try {
        const res = await API.createMassOrder({
          service_id: smmCategory.id,
          package_id: pkgId,
          quantity: qty,
          links,
        });
        if (box) {
          box.classList.remove('hidden');
          box.innerHTML = `Success: ${res.success} · Failed: ${res.failed}<br/>` +
            (res.results || []).map((r) =>
              r.ok ? `✅ ${escapeHtml(r.link)} #${r.order_id}` : `❌ ${escapeHtml(r.link)} ${escapeHtml(r.error || '')}`
            ).join('<br/>');
        }
        toast(`Mass: ${res.success} OK`);
        user = await API.getUser();
      } catch (e) { toast(e.message); }
      finally { if (btn) btn.disabled = false; }
    });
    // delegated copy on orders
    document.addEventListener('click', (e) => {
      const b = e.target.closest('.copy-oid, .copy-link, .copy-deliv');
      if (b) copyText(b.getAttribute('data-c'));
    });
    renderFavorites();

    // Deep link: start_param = service_123 / product_456 / orders / wallet
    try {
      const sp = window.Telegram?.WebApp?.initDataUnsafe?.start_param || '';
      if (sp.startsWith('service_')) {
        const id = Number(sp.split('_')[1]);
        if (id) { showPage('services'); setTimeout(() => openService?.(id), 500); }
      } else if (sp.startsWith('product_')) {
        const id = Number(sp.split('_')[1]);
        if (id) { showPage('store'); setTimeout(() => openProduct(id), 500); }
      } else if (sp === 'orders') showPage('orders');
      else if (sp === 'wallet') showPage('wallet');
    } catch {}
  }

  // Patch loadWallet to also load digital orders
  const _loadWalletOrig = typeof loadWallet === 'function' ? loadWallet : null;
  // will reassign after loadWallet defined - use hook at end


  // ---------- ORDERS ----------
  

  async function loadOrders() {
    const list = $('#orders-list');
    if (!list) return;
    list.innerHTML = '<div class="skeleton"></div>';
    try {
      // Fetch all for counts; filter client-side for status buckets
      const data = await API.getOrders('all');
      const orders = data.orders || data || [];
      const all = Array.isArray(orders) ? orders : [];
      window._allOrders = all;

      const norm = (s) => String(s || '').toLowerCase().replace(/\s+/g, ' ').trim();
      const counts = {
        all: all.length,
        Pending: 0,
        'In Progress': 0,
        Processing: 0,
        Completed: 0,
        Failed: 0,
        Canceled: 0,
      };
      for (const o of all) {
        const st = norm(o.status);
        if (st === 'pending') counts.Pending++;
        else if (st === 'in progress' || st === 'inprogress') counts['In Progress']++;
        else if (st === 'processing') counts.Processing++;
        else if (st === 'completed' || st === 'complete' || st === 'success') counts.Completed++;
        else if (st === 'failed') counts.Failed++;
        else if (st === 'canceled' || st === 'cancelled') counts.Canceled++;
      }
      // Update counts on buttons
      const setCount = (key, n) => {
        document.querySelectorAll('[data-count="' + key + '"]').forEach((el) => {
          el.textContent = String(n);
        });
      };
      setCount('all', counts.all);
      setCount('Pending', counts.Pending);
      setCount('In Progress', counts['In Progress']);
      setCount('Processing', counts.Processing);
      setCount('Completed', counts.Completed);
      setCount('Failed', counts.Failed);
      setCount('Canceled', counts.Canceled);
      console.log('[orders] loaded', counts.all, counts);

      renderOrdersList(orderStatus || 'all', ($('#order-id-search') && $('#order-id-search').value) || '');
    } catch (e) {
      list.innerHTML = `<div class="empty">${icon('alert', 28)}<span>${escapeHtml(e.message)}</span></div>`;
    }
  }

  function renderOrdersList(statusFilter, q) {
    const list = $('#orders-list');
    if (!list) return;
    list.innerHTML = '';
    const all = window._allOrders || [];
    const qq = (q || '').toLowerCase().trim();
    const want = String(statusFilter || 'all');

    const matchStatus = (st) => {
      const s = String(st || '').toLowerCase();
      if (want === 'all') return true;
      const w = want.toLowerCase();
      if (w === 'pending') return s === 'pending';
      if (w === 'in progress') return s === 'in progress' || s === 'inprogress';
      if (w === 'processing') return s === 'processing';
      if (w === 'completed') return s === 'completed' || s === 'complete' || s === 'success';
      if (w === 'failed') return s === 'failed';
      if (w === 'canceled') return s === 'canceled' || s === 'cancelled';
      return s === w;
    };

    let n = 0;
    for (const o of all) {
      if (!matchStatus(o.status)) continue;
      const oid = String(o.order_id || o.id || '');
      const link = String(o.link || '');
      const name = String(o.service_name || '');
      if (qq && !(oid.toLowerCase().includes(qq) || link.toLowerCase().includes(qq) || name.toLowerCase().includes(qq))) {
        continue;
      }
      n++;
      const st = String(o.status || '—');
      const stClass = 'os-' + st.toLowerCase().replace(/\s+/g, '');
      const el = document.createElement('div');
      el.className = 'card';
      el.innerHTML = `
        <div class="card-title" style="display:flex;justify-content:space-between;gap:8px;align-items:flex-start">
          <span>#${escapeHtml(oid)}</span>
          <span class="order-card-status ${stClass}">${escapeHtml(st)}</span>
        </div>
        <div class="card-meta" style="flex-direction:column;align-items:flex-start;gap:4px;margin-top:6px">
          <div>${escapeHtml(stripEmoji(name))}</div>
          <div style="word-break:break-all;opacity:.85">${escapeHtml(link)}</div>
          <div>Qty: ${o.quantity || '—'} · ${money(o.price)}</div>
        </div>
        <div class="row-flex" style="gap:6px;margin-top:8px;flex-wrap:wrap">
          <button type="button" class="btn btn-outline btn-sm copy-oid" data-c="${escapeHtml(oid)}">Copy ID</button>
          ${link ? `<button type="button" class="btn btn-outline btn-sm copy-link" data-c="${escapeHtml(link)}">Copy Link</button>` : ''}
          <button type="button" class="btn btn-ghost btn-sm fav-svc" data-name="${escapeHtml(name)}" data-id="${escapeHtml(String(o.service_id || ''))}">⭐</button>
        </div>
      `;
      el.querySelectorAll('button').forEach((b) => {
        b.addEventListener('click', (ev) => {
          ev.stopPropagation();
          if (b.classList.contains('fav-svc')) {
            toggleFav({ id: b.getAttribute('data-id') || name, name });
          }
        });
      });
      el.onclick = () => openOrderDetail(o.order_id || o.id);
      list.appendChild(el);
    }
    if (!n) list.innerHTML = `<div class="empty">${icon('inbox', 28)}<span>${t('noOrders')}</span></div>`;
  }

  async function openOrderDetail(id) {
    showPage('order-detail');
    const body = $('#order-detail-body');
    body.innerHTML = '<div class="skeleton"></div>';
    try {
      const o = await API.getOrder(id);
      body.innerHTML = `
        <div class="card" style="cursor:default">
          <div class="card-title">${escapeHtml(stripEmoji(o.service_name || o.product_name || 'Order'))}</div>
          <div class="card-meta" style="flex-direction:column;gap:8px;margin-top:10px;align-items:flex-start">
            <div>ID: <strong>${escapeHtml(o.order_id)}</strong></div>
            <div>Status: ${statusBadge(o.status)}</div>
            <div>Price: <strong class="card-price">${money(o.price || o.total_price)}</strong></div>
            ${o.quantity ? `<div>Qty: ${o.quantity}</div>` : ''}
            ${o.link ? `<div>Link: <span style="word-break:break-all">${escapeHtml(o.link)}</span></div>` : ''}
            ${
              o.delivered_content
                ? `
              <div class="section-title" style="padding:8px 0 0">Content</div>
              <div class="code-box">${escapeHtml(o.delivered_content)}</div>
            `
                : ''
            }
            ${o.created_at ? `<div style="font-size:12px;color:var(--muted)">${new Date(o.created_at * 1000).toLocaleString()}</div>` : ''}
          </div>
        </div>
      `;
    } catch (e) {
      body.innerHTML = `<div class="empty">${icon('alert', 28)}<span>${escapeHtml(e.message)}</span></div>`;
    }
  }

  // ---------- WALLET ----------
  async function loadWallet() {
    try {
      try { loadDigitalOrdersPanel(); } catch (e) {}
      const w = await API.getWallet();
      $('#wallet-balance').textContent = money(w.balance);
      const hist = $('#deposit-history');
      hist.innerHTML = '';
      (w.deposits || []).forEach((d) => {
        const el = document.createElement('div');
        el.className = 'card';
        el.style.cursor = 'default';
        const ts = d.created_at ? new Date((Number(d.created_at) > 1e12 ? Number(d.created_at) : Number(d.created_at) * 1000)).toLocaleString() : '';
        el.innerHTML = `
          <div class="card-title">${money(d.amount)}</div>
          <div class="card-meta">${statusBadge(d.status)} · ${escapeHtml(ts)}</div>
          <div class="card-meta"><span>Ref: ${escapeHtml(String(d.md5 || d.payment_id || '').slice(0, 16))}</span>
            <button type="button" class="btn btn-outline btn-sm copy-oid" data-c="${escapeHtml(String(d.md5 || ''))}">Copy Ref</button>
          </div>
        `;
        hist.appendChild(el);
      });
      if (!(w.deposits || []).length) {
        hist.innerHTML = `<div class="empty">${icon('wallet', 28)}<span>No deposits</span></div>`;
      }
    } catch (e) {
      toast(e.message);
    }
  }

  async function startDeposit() {
    const amount = parseFloat($('#deposit-amount').value);
    if (!amount || amount < 0.1) return toast('Min $0.10');
    const btn = $('#btn-create-deposit');
    btn.disabled = true;
    const resultBox = $('#deposit-result');
    if (resultBox) {
      resultBox.classList.add('hidden');
      resultBox.innerHTML = '';
    }
    try {
      const res = await API.createDeposit(amount);
      // QR is sent to Telegram Bot chat — not shown in Mini App
      const msg =
        (window.APP_LANG === 'en'
          ? res.message_en
          : res.message_km) ||
        (window.APP_LANG === 'en'
          ? 'QR was sent to your Telegram chat. Close Mini App and scan it in the Bot.'
          : 'QR ត្រូវបានផ្ញើទៅ Telegram chat។ សូមបិទ Mini App រួចស្កេនក្នុង Bot។');
      if (resultBox) {
        resultBox.classList.remove('hidden');
        resultBox.innerHTML = `
          <div class="card" style="cursor:default;text-align:center">
            <div style="margin-bottom:8px">${icon('check', 28)}</div>
            <div class="card-title">OK</div>
            <div style="font-size:13px;color:var(--muted);margin-top:8px;line-height:1.5">${escapeHtml(msg)}</div>
            <div style="font-size:12px;color:var(--muted);margin-top:10px">
              Amount: <strong>${money(res.amount)}</strong><br/>
              Ref: ${escapeHtml(String(res.payment_id || ''))}
            </div>
            <button class="btn btn-outline btn-block" type="button" id="btn-close-mini" style="margin-top:14px">
              បិទ Mini App / មើល Bot
            </button>
          </div>
        `;
        $('#btn-close-mini')?.addEventListener('click', () => {
          try {
            if (window.Telegram?.WebApp?.close) window.Telegram.WebApp.close();
          } catch (_) {}
        });
      }
      toast(window.APP_LANG === 'en' ? 'QR sent to Bot' : 'QR បានផ្ញើទៅ Bot');
      loadWallet();
    } catch (e) {
      toast(e.message);
    } finally {
      btn.disabled = false;
    }
  }

  // ---------- ACCOUNT ----------
  function loadAccount() {
    if (!user) return;
    $('#acc-name').textContent = user.first_name || 'User';
    $('#acc-username').textContent = user.username ? '@' + user.username : '—';
    $('#acc-id').textContent = user.user_id;
    $('#acc-balance').textContent = money(user.balance);
    $('#acc-orders').textContent = user.total_orders || 0;
    $('#acc-completed').textContent = user.completed_orders || 0;
    $('#lang-select').value = user.lang || 'km';
    const av = (user.first_name || user.username || 'U').charAt(0).toUpperCase();
    setAvatarEl($('#acc-avatar'), av);
    // Admin Panel button — only ADMIN_ID
    const btnAdm = $('#btn-admin-panel');
    if (btnAdm) {
      if (user.is_admin) btnAdm.classList.remove('hidden');
      else btnAdm.classList.add('hidden');
    }
  }

  // ---------- MINI APP ADMIN (Service WebApp) ----------
  let adminPlats = [];
  let adminPlatPage = 0;
  let adminSvcPage = 0;
  let adminCurrentPlatId = null;
  let adminCurrentSvcId = null;
  const ADMIN_PAGE = 8;

  function loadAdminHome() {
    if (!user || !user.is_admin) {
      toast('Admin only');
      showPage('account', false);
      return;
    }
  }

  async function loadAdminPlatforms() {
    if (!user || !user.is_admin) {
      toast('Admin only');
      showPage('account', false);
      return;
    }
    const list = $('#admin-plat-list');
    if (!list) return;
    list.innerHTML = '<div class="skeleton"></div>';
    try {
      const data = await API.adminPlatforms();
      adminPlats = data.platforms || [];
      renderAdminPlats();
    } catch (e) {
      list.innerHTML = `<div class="empty">${icon('alert', 28)}<span>${escapeHtml(e.message)}</span></div>`;
    }
  }

  function renderAdminPlats() {
    const list = $('#admin-plat-list');
    const nav = $('#admin-plat-nav');
    if (!list) return;
    const total = adminPlats.length;
    const pages = Math.max(1, Math.ceil(total / ADMIN_PAGE));
    if (adminPlatPage >= pages) adminPlatPage = pages - 1;
    const chunk = adminPlats.slice(adminPlatPage * ADMIN_PAGE, (adminPlatPage + 1) * ADMIN_PAGE);
    list.innerHTML = '';
    if (!chunk.length) {
      list.innerHTML = `<div class="empty"><span>No categories — add above or Auto-Pull → WebApp</span></div>`;
    }
    chunk.forEach((p) => {
      const el = document.createElement('div');
      el.className = 'card';
      el.style.cursor = 'pointer';
      el.innerHTML = `
        <div class="card-title">${escapeHtml((p.emoji || '') + ' ' + (p.name || ''))}</div>
        <div class="card-meta">${p.services_count || 0} services · #${p.id}</div>
      `;
      el.onclick = () => {
        adminCurrentPlatId = p.id;
        adminSvcPage = 0;
        showPage('admin-wa-svc');
      };
      // long-press / delete via separate button
      const del = document.createElement('button');
      del.className = 'btn btn-outline btn-sm';
      del.style.marginTop = '8px';
      del.textContent = '❌ Delete';
      del.onclick = async (ev) => {
        ev.stopPropagation();
        if (!confirm('Delete category and all its services?')) return;
        try {
          await API.adminDeletePlatform(p.id);
          toast('Deleted');
          loadAdminPlatforms();
        } catch (e) { toast(e.message); }
      };
      el.appendChild(del);
      list.appendChild(el);
    });
    if (nav) {
      nav.innerHTML = '';
      if (adminPlatPage > 0) {
        const b = document.createElement('button');
        b.className = 'btn btn-outline';
        b.textContent = '⬅️';
        b.onclick = () => { adminPlatPage--; renderAdminPlats(); };
        nav.appendChild(b);
      }
      const info = document.createElement('span');
      info.className = 'note';
      info.style.margin = '0 8px';
      info.textContent = `${adminPlatPage + 1}/${pages}`;
      nav.appendChild(info);
      if (adminPlatPage < pages - 1) {
        const b = document.createElement('button');
        b.className = 'btn btn-outline';
        b.textContent = '➡️';
        b.onclick = () => { adminPlatPage++; renderAdminPlats(); };
        nav.appendChild(b);
      }
    }
  }

  async function loadAdminServices() {
    if (!adminCurrentPlatId) {
      showPage('admin-wa');
      return;
    }
    const list = $('#admin-svc-list');
    const title = $('#admin-wa-svc-title');
    if (!list) return;
    list.innerHTML = '<div class="skeleton"></div>';
    try {
      const data = await API.adminPlatformServices(adminCurrentPlatId);
      const pname = (data.platform && data.platform.name) || 'Services';
      if (title) title.textContent = '📦 ' + pname;
      window._adminSvcs = data.services || [];
      renderAdminSvcs();
    } catch (e) {
      list.innerHTML = `<div class="empty">${icon('alert', 28)}<span>${escapeHtml(e.message)}</span></div>`;
    }
  }

  function renderAdminSvcs() {
    const list = $('#admin-svc-list');
    const nav = $('#admin-svc-nav');
    const svcs = window._adminSvcs || [];
    const total = svcs.length;
    const pages = Math.max(1, Math.ceil(total / ADMIN_PAGE));
    if (adminSvcPage >= pages) adminSvcPage = pages - 1;
    const chunk = svcs.slice(adminSvcPage * ADMIN_PAGE, (adminSvcPage + 1) * ADMIN_PAGE);
    list.innerHTML = '';
    if (!chunk.length) {
      list.innerHTML = `<div class="empty"><span>No services in this category</span></div>`;
    }
    chunk.forEach((s) => {
      const el = document.createElement('div');
      el.className = 'card';
      el.style.cursor = 'pointer';
      el.innerHTML = `
        <div class="card-title">${escapeHtml(s.name || '')}</div>
        <div class="card-meta">$${Number(s.original_price || 0).toFixed(4)}/1K · ID ${escapeHtml(s.smm_service_id || '—')} · ${s.min_qty}-${s.max_qty}</div>
      `;
      el.onclick = () => openAdminService(s.id);
      list.appendChild(el);
    });
    if (nav) {
      nav.innerHTML = '';
      if (adminSvcPage > 0) {
        const b = document.createElement('button');
        b.className = 'btn btn-outline';
        b.textContent = '⬅️';
        b.onclick = () => { adminSvcPage--; renderAdminSvcs(); };
        nav.appendChild(b);
      }
      const info = document.createElement('span');
      info.className = 'note';
      info.style.margin = '0 8px';
      info.textContent = `${adminSvcPage + 1}/${pages}`;
      nav.appendChild(info);
      if (adminSvcPage < pages - 1) {
        const b = document.createElement('button');
        b.className = 'btn btn-outline';
        b.textContent = '➡️';
        b.onclick = () => { adminSvcPage++; renderAdminSvcs(); };
        nav.appendChild(b);
      }
    }
  }

  async function openAdminService(id) {
    adminCurrentSvcId = id;
    showPage('admin-wa-edit');
    try {
      const s = await API.adminService(id);
      if ($('#adm-svc-name')) $('#adm-svc-name').value = s.name || '';
      if ($('#adm-svc-group')) $('#adm-svc-group').value = s.group_name || '';
      if ($('#adm-svc-price')) $('#adm-svc-price').value = s.selling_price ?? s.original_price ?? 0;
      if ($('#adm-svc-cost')) $('#adm-svc-cost').value = s.cost_price ?? 0;
      if ($('#adm-svc-profit-type')) $('#adm-svc-profit-type').value = s.profit_type || 'flat';
      if ($('#adm-svc-profit-val')) $('#adm-svc-profit-val').value = s.profit_value ?? 0;
      if ($('#adm-svc-smmid')) $('#adm-svc-smmid').value = s.smm_service_id || '';
      if ($('#adm-svc-panel')) $('#adm-svc-panel').value = s.panel_id ?? 1;
      if ($('#adm-svc-min')) $('#adm-svc-min').value = s.min_qty ?? 1;
      if ($('#adm-svc-max')) $('#adm-svc-max').value = s.max_qty ?? 100000;
      if ($('#adm-svc-disabled')) $('#adm-svc-disabled').value = String(s.is_disabled ? 1 : 0);
      if ($('#adm-svc-desc')) $('#adm-svc-desc').value = s.description || '';
    } catch (e) {
      toast(e.message);
    }
  }

  // ---------- FULL SERVICE IMPORT ----------
  let fsPanelId = null;
  let fsCategories = [];
  let fsAllServices = [];
  let fsSelected = {}; // id -> bool
  let fsProfitType = 'flat';
  let fsProfitValue = 0.1;
  let fsListStatus = 'active';

  async function loadAdminFullHub() {
    if (!user || !user.is_admin) {
      toast('Admin only');
      showPage('account', false);
      return;
    }
    const list = $('#admin-provider-list');
    const actions = $('#admin-full-actions');
    if (!list) return;
    list.innerHTML = '<div class="skeleton"></div>';
    try {
      const data = await API.adminProviders();
      const providers = data.providers || [];
      list.innerHTML = '';
      if (!providers.length) {
        list.innerHTML = '<div class="empty"><span>មិនទាន់មាន Provider — កំណត់នៅ Bot Admin → SMM Panel Settings</span></div>';
        actions?.classList.add('hidden');
        return;
      }
      providers.forEach((p) => {
        const el = document.createElement('div');
        el.className = 'card';
        el.style.cursor = 'pointer';
        el.innerHTML = `
          <div class="card-title">${escapeHtml(p.name)}</div>
          <div class="card-meta">${p.configured ? '✅ Configured' : '⚠️ Incomplete'} · Key ${escapeHtml(p.api_key_masked || '—')}</div>
          <div class="card-meta" style="font-size:11px;opacity:.7">${escapeHtml(p.api_url || '')}</div>
        `;
        el.onclick = () => {
          if (!p.configured) return toast('Provider មិនទាន់កំណត់ URL/KEY');
          fsPanelId = p.id;
          list.querySelectorAll('.card').forEach((c) => c.classList.remove('active-card'));
          el.classList.add('active-card');
          actions?.classList.remove('hidden');
          toast('Selected: ' + p.name);
        };
        list.appendChild(el);
      });
    } catch (e) {
      list.innerHTML = `<div class="empty"><span>${escapeHtml(e.message)}</span></div>`;
    }
  }

  async function fsStartFetch() {
    if (!fsPanelId) return toast('ជ្រើស Provider សិន');
    showPage('admin-full-pick');
    const loading = $('#fs-loading');
    const toolbar = $('#fs-toolbar');
    const catList = $('#fs-cat-list');
    if (loading) loading.classList.remove('hidden');
    if (loading) loading.textContent = 'Importing Services... កំពុងទាញពី Provider...';
    toolbar?.classList.add('hidden');
    if (catList) catList.innerHTML = '';
    fsSelected = {};
    fsAllServices = [];
    fsCategories = [];
    try {
      const data = await API.adminFetchServices(fsPanelId);
      fsCategories = data.categories || [];
      fsAllServices = data.services || [];
      fsAllServices.forEach((s) => { fsSelected[s.provider_service_id] = true; });
      if (loading) loading.classList.add('hidden');
      toolbar?.classList.remove('hidden');
      if ($('#fs-select-all')) $('#fs-select-all').checked = true;
      if ($('#fs-profit-val')) $('#fs-profit-val').value = fsProfitValue;
      fsRenderCats();
      fsUpdateSelectedCount();
    } catch (e) {
      if (loading) loading.textContent = e.message || 'API Connection Failed';
      toast(e.message);
    }
  }

  function fsCalcSell(cost) {
    const c = Number(cost) || 0;
    if (fsProfitType === 'percent') return Math.round(c * (1 + fsProfitValue / 100) * 1e6) / 1e6;
    return Math.round((c + fsProfitValue) * 1e6) / 1e6;
  }

  function fsUpdateSelectedCount() {
    const total = fsAllServices.length;
    const sel = Object.values(fsSelected).filter(Boolean).length;
    if ($('#fs-selected-count')) $('#fs-selected-count').textContent = `Selected: ${sel} / ${total}`;
  }

  function fsRenderCats() {
    const list = $('#fs-cat-list');
    if (!list) return;
    list.innerHTML = '';
    fsCategories.forEach((cat) => {
      const head = document.createElement('div');
      head.className = 'section-title';
      head.textContent = cat.name + ` (${(cat.services || []).length})`;
      list.appendChild(head);
      (cat.services || []).forEach((s) => {
        const id = s.provider_service_id;
        const el = document.createElement('div');
        el.className = 'card';
        el.innerHTML = `
          <label class="row" style="gap:10px;align-items:flex-start">
            <input type="checkbox" class="fs-chk" data-id="${escapeHtml(id)}" ${fsSelected[id] ? 'checked' : ''} />
            <div style="flex:1">
              <div class="card-title">${escapeHtml(s.name)}</div>
              <div class="card-meta">ID ${escapeHtml(id)} · Cost $${Number(s.cost_price || 0).toFixed(4)}/1K · ${s.min_qty}-${s.max_qty}</div>
              <div class="card-meta" style="font-size:11px;opacity:.75">${escapeHtml((s.description || '').slice(0, 120))}</div>
            </div>
          </label>
        `;
        const chk = el.querySelector('.fs-chk');
        chk.addEventListener('change', () => {
          fsSelected[id] = !!chk.checked;
          fsUpdateSelectedCount();
        });
        list.appendChild(el);
      });
    });
  }

  function fsRenderPreview() {
    const box = $('#fs-preview');
    if (!box) return;
    const selected = fsAllServices.filter((s) => fsSelected[s.provider_service_id]);
    const rows = selected.slice(0, 30).map((s) => {
      const cost = Number(s.cost_price || 0);
      const sell = fsCalcSell(cost);
      const profit = Math.round((sell - cost) * 1e6) / 1e6;
      return `<tr>
        <td style="padding:4px 6px">${escapeHtml(s.name).slice(0, 28)}</td>
        <td style="padding:4px 6px;text-align:right">$${cost.toFixed(4)}</td>
        <td style="padding:4px 6px;text-align:right">$${profit.toFixed(4)}</td>
        <td style="padding:4px 6px;text-align:right"><strong>$${sell.toFixed(4)}</strong></td>
      </tr>`;
    }).join('');
    box.classList.remove('hidden');
    box.innerHTML = `
      <div class="card-title" style="margin-bottom:6px">Preview (${selected.length} services)${selected.length > 30 ? ' · first 30' : ''}</div>
      <table style="width:100%;font-size:12px;border-collapse:collapse">
        <thead><tr>
          <th style="text-align:left;padding:4px 6px">Service</th>
          <th style="text-align:right;padding:4px 6px">Cost</th>
          <th style="text-align:right;padding:4px 6px">Profit</th>
          <th style="text-align:right;padding:4px 6px">Selling</th>
        </tr></thead>
        <tbody>${rows || '<tr><td colspan="4">No selection</td></tr>'}</tbody>
      </table>
      <div class="note" style="margin-top:6px">Profit: ${fsProfitType === 'percent' ? fsProfitValue + '%' : '$' + fsProfitValue}</div>
    `;
  }

  async function fsDoImport() {
    const ids = Object.keys(fsSelected).filter((k) => fsSelected[k]);
    if (!ids.length) return toast('រើស service យ៉ាងហោច 1');
    fsProfitValue = parseFloat($('#fs-profit-val')?.value) || fsProfitValue;
    if (fsProfitValue < 0) return toast('សូមកំណត់តម្លៃចំណេញសិន មុនពេល Add Services។');
    if (!confirm(`Publish ${ids.length} services?\nProfit: ${fsProfitType === 'percent' ? fsProfitValue + '%' : '$' + fsProfitValue}`)) return;
    try {
      toast('Importing...');
      const res = await API.adminImportServices({
        panel: fsPanelId,
        profit_type: fsProfitType,
        profit_value: fsProfitValue,
        service_ids: ids,
      });
      const st = res.stats || {};
      alert(
        `Import Completed\n\n` +
        `Total Found: ${st.total_found ?? '—'}\n` +
        `Selected: ${st.selected ?? ids.length}\n` +
        `New: ${st.new ?? 0}\n` +
        `Updated: ${st.updated ?? 0}\n` +
        `Failed: ${st.failed ?? 0}`
      );
      toast('Done');
      showPage('admin-full');
    } catch (e) {
      toast(e.message);
    }
  }

  async function loadAdminFullList() {
    if (!user || !user.is_admin) return;
    const title = $('#fs-list-title');
    const body = $('#fs-list-body');
    if (!body) return;
    const labels = { active: 'សេវាកម្មចាស់', deleted: 'សេវាកម្មបានលុប', disabled: 'សេវាកម្មបានបិទ' };
    if (title) title.textContent = labels[fsListStatus] || 'Services';
    body.innerHTML = '<div class="skeleton"></div>';
    const q = ($('#fs-list-search')?.value || '').trim();
    try {
      const data = await API.adminFullServices(fsListStatus, fsPanelId || '', q);
      const svcs = data.services || [];
      body.innerHTML = '';
      if (!svcs.length) {
        body.innerHTML = '<div class="empty"><span>No services</span></div>';
        return;
      }
      svcs.forEach((s) => {
        const el = document.createElement('div');
        el.className = 'card';
        el.innerHTML = `
          <div class="card-title">${escapeHtml(s.name || '')}</div>
          <div class="card-meta">ID ${escapeHtml(s.smm_service_id || '')} · Sell $${Number(s.selling_price || s.original_price || 0).toFixed(4)}/1K · Cost $${Number(s.cost_price || 0).toFixed(4)}</div>
          <div class="row" style="gap:6px;margin-top:8px;flex-wrap:wrap"></div>
        `;
        const row = el.querySelector('.row');
        if (fsListStatus === 'deleted') {
          const b1 = document.createElement('button');
          b1.className = 'btn btn-primary btn-sm';
          b1.textContent = 'Restore';
          b1.onclick = async () => { try { await API.adminRestoreService(s.id); toast('Restored'); loadAdminFullList(); } catch (e) { toast(e.message); } };
          const b2 = document.createElement('button');
          b2.className = 'btn btn-outline btn-sm';
          b2.textContent = 'Delete Permanently';
          b2.onclick = async () => {
            if (!confirm('Permanent delete?')) return;
            try { await API.adminDeleteService(s.id, true); toast('Deleted'); loadAdminFullList(); } catch (e) { toast(e.message); }
          };
          row.appendChild(b1);
          row.appendChild(b2);
        } else if (fsListStatus === 'disabled') {
          const b1 = document.createElement('button');
          b1.className = 'btn btn-primary btn-sm';
          b1.textContent = 'Enable';
          b1.onclick = async () => { try { await API.adminEnableService(s.id); toast('Enabled'); loadAdminFullList(); } catch (e) { toast(e.message); } };
          row.appendChild(b1);
        } else {
          const b1 = document.createElement('button');
          b1.className = 'btn btn-outline btn-sm';
          b1.textContent = 'Edit';
          b1.onclick = () => openAdminService(s.id);
          const b2 = document.createElement('button');
          b2.className = 'btn btn-outline btn-sm';
          b2.textContent = 'Disable';
          b2.onclick = async () => { try { await API.adminDisableService(s.id); toast('Disabled'); loadAdminFullList(); } catch (e) { toast(e.message); } };
          const b3 = document.createElement('button');
          b3.className = 'btn btn-outline btn-sm';
          b3.textContent = 'Delete';
          b3.onclick = async () => {
            if (!confirm('Move to deleted?')) return;
            try { await API.adminDeleteService(s.id, false); toast('Deleted'); loadAdminFullList(); } catch (e) { toast(e.message); }
          };
          row.appendChild(b1);
          row.appendChild(b2);
          row.appendChild(b3);
        }
        body.appendChild(el);
      });
    } catch (e) {
      body.innerHTML = `<div class="empty"><span>${escapeHtml(e.message)}</span></div>`;
    }
  }

  // ---------- TICKETS ----------
  async function loadTickets() {
    const list = $('#tickets-list');
    list.innerHTML = '<div class="skeleton"></div>';
    try {
      const data = await API.getTickets();
      list.innerHTML = '';
      (data.tickets || []).forEach((tkt) => {
        const el = document.createElement('div');
        el.className = 'card';
        el.style.cursor = 'default';
        el.innerHTML = `
          <div class="card-title">#${tkt.id} · ${escapeHtml(tkt.category)}</div>
          <div class="card-meta">${statusBadge(tkt.status)}</div>
          <div style="font-size:13px;margin-top:6px;color:var(--muted)">${escapeHtml(tkt.message || '')}</div>
          ${tkt.admin_reply ? `<div style="font-size:13px;margin-top:6px;color:var(--success)">Admin: ${escapeHtml(tkt.admin_reply)}</div>` : ''}
        `;
        list.appendChild(el);
      });
      if (!(data.tickets || []).length) {
        list.innerHTML = `<div class="empty">${icon('ticket', 28)}<span>No tickets</span></div>`;
      }
    } catch (e) {
      list.innerHTML = `<div class="empty">${icon('alert', 28)}<span>${escapeHtml(e.message)}</span></div>`;
    }
  }

  function escapeHtml(s) {
    return String(s || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  // ---------- Theme ----------
  function applyTheme(dark) {
    document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
    localStorage.setItem('theme', dark ? 'dark' : 'light');
    const toggle = $('#theme-toggle');
    if (toggle) toggle.checked = dark;
    const btn = $('#btn-theme');
    if (btn) btn.innerHTML = dark ? icon('moon', 20) : icon('sun', 20);
    if (tg) {
      try {
        tg.setHeaderColor(dark ? '#0b1220' : '#f1f5f9');
        tg.setBackgroundColor(dark ? '#0b1220' : '#f1f5f9');
      } catch (_) {}
    }
  }

  function bindEvents() {
    $$('[data-nav]').forEach((el) => {
      el.addEventListener('click', () => showPage(el.dataset.nav));
    });
    document.querySelectorAll('.back-btn, [data-back]').forEach((el) => {
      el.addEventListener('click', goBack);
    });
    $('#btn-add-funds-home')?.addEventListener('click', () => showPage('wallet'));
    $('#btn-theme')?.addEventListener('click', () => {
      const dark = document.documentElement.getAttribute('data-theme') !== 'light';
      applyTheme(!dark);
    });
    $('#theme-toggle')?.addEventListener('change', (e) => applyTheme(e.target.checked));
    async function onLangChange(val) {
      try {
        await API.setLang(val);
        window.APP_LANG = val;
        if (user) user.lang = val;
        const a = $('#lang-select'); if (a) a.value = val;
        const b = $('#lang-select-home'); if (b) b.value = val;
        toast('OK');
        loadHome();
      } catch (err) {
        toast(err.message);
      }
    }
    $('#lang-select')?.addEventListener('change', (e) => onLangChange(e.target.value));
    $('#lang-select-home')?.addEventListener('change', (e) => onLangChange(e.target.value));
    let orderSearchTimer;
    $('#order-svc-search')?.addEventListener('input', (e) => {
      clearTimeout(orderSearchTimer);
      orderSearchTimer = setTimeout(() => {
        if (typeof renderOrderSvcList === 'function') renderOrderSvcList(e.target.value.trim());
      }, 250);
    });
    $('#btn-support')?.addEventListener('click', () => showPage('support'));
    $('#btn-admin-panel')?.addEventListener('click', () => {
      if (!user || !user.is_admin) return toast('Admin only');
      showPage('admin');
    });
    $('#btn-admin-wa')?.addEventListener('click', () => {
      adminPlatPage = 0;
      showPage('admin-wa');
    });
    $('#btn-admin-full')?.addEventListener('click', () => showPage('admin-full'));
    $('#btn-fs-fetch')?.addEventListener('click', () => fsStartFetch());
    $('#btn-fs-old')?.addEventListener('click', () => { fsListStatus = 'active'; showPage('admin-full-list'); });
    $('#btn-fs-deleted')?.addEventListener('click', () => { fsListStatus = 'deleted'; showPage('admin-full-list'); });
    $('#btn-fs-disabled')?.addEventListener('click', () => { fsListStatus = 'disabled'; showPage('admin-full-list'); });
    $('#fs-select-all')?.addEventListener('change', (e) => {
      const on = !!e.target.checked;
      Object.keys(fsSelected).forEach((k) => { fsSelected[k] = on; });
      document.querySelectorAll('.fs-chk').forEach((c) => { c.checked = on; });
      fsUpdateSelectedCount();
    });
    $('#btn-fs-price')?.addEventListener('click', () => {
      $('#fs-price-box')?.classList.toggle('hidden');
    });
    $('#btn-fs-pt-pct')?.addEventListener('click', () => {
      fsProfitType = 'percent';
      if ($('#fs-profit-hint')) $('#fs-profit-hint').textContent = 'Profit % (ឧ. 20 = +20% លើ cost)';
    });
    $('#btn-fs-pt-flat')?.addEventListener('click', () => {
      fsProfitType = 'flat';
      if ($('#fs-profit-hint')) $('#fs-profit-hint').textContent = 'Profit $ ថេរ បន្ថែមលើ cost របស់ service នីមួយៗ';
    });
    $('#btn-fs-apply-price')?.addEventListener('click', () => {
      fsProfitValue = parseFloat($('#fs-profit-val')?.value) || 0;
      fsRenderPreview();
    });
    $('#btn-fs-done')?.addEventListener('click', () => fsDoImport());
    let _fsSearchT = null;
    $('#fs-list-search')?.addEventListener('input', () => {
      clearTimeout(_fsSearchT);
      _fsSearchT = setTimeout(() => loadAdminFullList(), 300);
    });
    
    $('#btn-admin-del-all-wa')?.addEventListener('click', async () => {
      if (!confirm('❌ លុប Service WebApp ទាំងអស់?\nBot មិនប៉ះពាល់។\nមិនអាចត្រឡប់វិញ!')) return;
      try {
        const r = await API.adminDeleteAllServices('webapp');
        toast('Deleted ' + (r.deleted || 0) + ' WebApp services');
        if (typeof loadAdminPlatforms === 'function') loadAdminPlatforms();
        else showPage('admin-wa');
      } catch (err) { toast(err.message || 'Failed'); }
    });
$('#btn-admin-add-plat')?.addEventListener('click', async () => {
      const name = ($('#admin-plat-name')?.value || '').trim();
      if (!name) return toast('Enter category name');
      try {
        await API.adminCreatePlatform(name);
        if ($('#admin-plat-name')) $('#admin-plat-name').value = '';
        toast('Category added');
        loadAdminPlatforms();
      } catch (e) { toast(e.message); }
    });
    $('#btn-admin-add-svc')?.addEventListener('click', async () => {
      if (!adminCurrentPlatId) return;
      const name = prompt('Service name:');
      if (!name) return;
      const price = prompt('Price /1K (USD):', '0.10');
      const smmid = prompt('SMM Service ID:', '');
      try {
        await API.adminCreateService({
          platform_id: adminCurrentPlatId,
          name,
          original_price: parseFloat(price) || 0,
          smm_service_id: smmid || '',
        });
        toast('Service added');
        loadAdminServices();
      } catch (e) { toast(e.message); }
    });
    $('#btn-adm-svc-save')?.addEventListener('click', async () => {
      if (!adminCurrentSvcId) return;
      try {
        const sell = parseFloat($('#adm-svc-price')?.value) || 0;
        await API.adminUpdateService(adminCurrentSvcId, {
          name: ($('#adm-svc-name')?.value || '').trim(),
          group_name: ($('#adm-svc-group')?.value || '').trim(),
          original_price: sell,
          selling_price: sell,
          cost_price: parseFloat($('#adm-svc-cost')?.value) || 0,
          profit_type: ($('#adm-svc-profit-type')?.value || 'flat'),
          profit_value: parseFloat($('#adm-svc-profit-val')?.value) || 0,
          smm_service_id: ($('#adm-svc-smmid')?.value || '').trim(),
          panel_id: parseInt($('#adm-svc-panel')?.value, 10) || 1,
          min_qty: parseInt($('#adm-svc-min')?.value, 10) || 1,
          max_qty: parseInt($('#adm-svc-max')?.value, 10) || 100000,
          is_disabled: parseInt($('#adm-svc-disabled')?.value, 10) || 0,
          status: (parseInt($('#adm-svc-disabled')?.value, 10) ? 'disabled' : 'active'),
          description: ($('#adm-svc-desc')?.value || '').trim(),
        });
        toast('Saved');
        showPage('admin-wa-svc');
      } catch (e) { toast(e.message); }
    });
    $('#btn-adm-svc-del')?.addEventListener('click', async () => {
      if (!adminCurrentSvcId) return;
      if (!confirm('Delete this service?')) return;
      try {
        await API.adminDeleteService(adminCurrentSvcId);
        toast('Deleted');
        showPage('admin-wa-svc');
      } catch (e) { toast(e.message); }
    });
    $('#btn-send-ticket')?.addEventListener('click', async () => {
      const cat = $('#ticket-cat').value;
      const msg = $('#ticket-msg').value.trim();
      if (msg.length < 3) return toast('សរសេរសារ');
      try {
        await API.createTicket(cat, msg);
        toast(t('success'));
        $('#ticket-msg').value = '';
        loadTickets();
      } catch (e) {
        toast(e.message);
      }
    });
    $('#btn-create-deposit')?.addEventListener('click', startDeposit);
    $$('.preset').forEach((b) => {
      b.addEventListener('click', () => {
        $$('.preset').forEach((x) => x.classList.remove('active'));
        b.classList.add('active');
        $('#deposit-amount').value = b.dataset.amt;
      });
    });
    document.addEventListener('click', (e) => {
      const wrap = e.target.closest('.ord-status-wrap, #order-status-grid');
      if (!wrap) return;
      const btn = e.target.closest('button, .ord-chip, .st-btn');
      if (!btn || !wrap.contains(btn)) return;
      if (btn.id === 'btn-order-search') {
        const box = $('#order-search-box');
        if (box) box.classList.toggle('hidden');
        $('#order-id-search')?.focus();
        return;
      }
      if (btn.id === 'btn-order-refresh') {
        toast(t('loading'));
        loadOrders();
        return;
      }
      if (btn.id === 'btn-order-track') {
        orderStatus = 'Processing';
        wrap.querySelectorAll('[data-status]').forEach((b) => b.classList.remove('active'));
        const p = wrap.querySelector('[data-status="Processing"], .st-processing');
        if (p) p.classList.add('active');
        renderOrdersList('Processing', '');
        toast('តាមដាន: Processing / In Progress');
        return;
      }
      if (btn.id === 'btn-order-refund') {
        showPage('support');
        const cat = $('#ticket-cat');
        if (cat) cat.value = 'order';
        toast('សូមបើក Ticket សម្រាប់ស្នើសុំសងប្រាក់');
        return;
      }
      if (btn.dataset.nav) {
        showPage(btn.dataset.nav);
        return;
      }
      if (!btn.dataset.status) return;
      wrap.querySelectorAll('[data-status]').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      orderStatus = btn.dataset.status;
      renderOrdersList(orderStatus, ($('#order-id-search') && $('#order-id-search').value) || '');
    });
    let orderIdSearchTimer;
    $('#order-id-search')?.addEventListener('input', (e) => {
      clearTimeout(orderIdSearchTimer);
      orderIdSearchTimer = setTimeout(() => {
        renderOrdersList(orderStatus || 'all', e.target.value.trim());
      }, 250);
    });
    let searchTimer;
    $('#svc-search')?.addEventListener('input', (e) => {
      clearTimeout(searchTimer);
      searchTimer = setTimeout(() => loadServices(e.target.value.trim()), 300);
    });
  }

  async function init() {
    // Splash + static icons
    const splash = $('#splash-ico');
    if (splash) splash.innerHTML = icon('store', 32);
    hydrateIcons(document);
    $$('.back-btn').forEach((b) => {
      b.innerHTML = icon('arrowLeft', 20);
    });

    const savedTheme = localStorage.getItem('theme');
    applyTheme(savedTheme !== 'light');
    bindEvents();

    try {
      user = await API.getUser();
      window.APP_LANG = user.lang || 'km';
      $('#splash').classList.add('hidden');
      $('#main').classList.remove('hidden');
      $('#bottom-nav').classList.remove('hidden');
      showPage('home');
    } catch (e) {
      $('#splash').innerHTML = `
        <div class="splash-logo">${icon('alert', 32)}</div>
        <div style="padding:20px;text-align:center;max-width:280px">
          <p style="margin-bottom:12px;font-weight:600">${escapeHtml(e.message || 'Auth failed')}</p>
          <p style="font-size:13px;color:var(--muted)">Open this Mini App from the Telegram Bot button.</p>
        </div>
      `;
    }
  }

  init();
})();
