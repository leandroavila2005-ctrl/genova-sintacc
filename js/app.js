/**
 * Génova Sin TACC · App (SPA)
 * Routing, auth flow, render de vistas y cálculo de indicadores.
 * Por ahora: Dashboard completo; el resto de las vistas se construyen en orden.
 */
(function () {
  'use strict';

  /* ----------------------------- estado ----------------------------- */
  var state = {
    user: null,        // { email, rol }
    lists: null,       // listas maestras
    period: { anio: null, mes: null },
    dash: null,        // datasets del año
    route: 'dashboard',
    monthOpen: false,
    ventas: { rows: null, filter: 'Todos', query: '' },
    mov: { rows: null, filter: 'Todas', iva: 'Todos', query: '' },
    mpprod: { tab: 'mp', mp: { rows: null, query: '' }, prod: { rows: null, query: '' }, stockQuery: '', recProd: null },
    precios: { query: '', edits: {}, sel: {}, aumento: '' },
    config: { section: 'mp' }
  };

  var MONTHS = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
  var MONTHS_SHORT = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];

  var NAV = [
    { key: 'dashboard',   label: 'Dashboard',       icon: 'layout-dashboard' },
    { key: 'ventas',      label: 'Ventas',          icon: 'receipt-text' },
    { key: 'precios',     label: 'Precios',         icon: 'tag' },
    { key: 'movimientos', label: 'Movimientos',     icon: 'arrow-left-right' },
    { key: 'mp',          label: 'MP y Producción', icon: 'package' },
    { key: 'config',      label: 'Configuración',   icon: 'settings' }
  ];
  var TITLES = { dashboard:'Dashboard', ventas:'Ventas', precios:'Precios', movimientos:'Movimientos', mp:'MP y Producción', config:'Configuración' };

  /* ----------------------------- helpers ----------------------------- */
  function $(id) { return document.getElementById(id); }
  function toNum(v) { if (v === '' || v == null) return 0; var n = Number(String(v).replace(/[^0-9.\-]/g, '')); return isNaN(n) ? 0 : n; }
  function money(n) { return '$' + Math.round(toNum(n)).toLocaleString('es-AR'); }
  function moneyShort(n) { n = toNum(n); if (Math.abs(n) >= 1e6) return '$' + (n / 1e6).toLocaleString('es-AR', { maximumFractionDigits: 2 }) + 'M'; return money(n); }
  function pct(x) { return (x * 100).toLocaleString('es-AR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + '%'; }
  function num(n) { return Math.round(toNum(n)).toLocaleString('es-AR'); }
  function escapeHtml(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;' }[c]; }); }
  function drawIcons() { try { if (window.lucide) window.lucide.createIcons(); } catch (e) {} }

  function showScreen(id) {
    ['screen-login', 'screen-booting', 'screen-denied', 'screen-app'].forEach(function (s) {
      $(s).classList.toggle('is-hidden', s !== id);
    });
    drawIcons();
  }
  function showLoader(on) { $('loader').classList.toggle('is-hidden', !on); }

  function toast(msg, isError) {
    var t = $('toast');
    t.className = 'gv-toast' + (isError ? ' error' : '');
    t.innerHTML = '<span class="ico"><i data-lucide="' + (isError ? 'alert-circle' : 'check-circle-2') + '"></i></span>' + escapeHtml(msg);
    drawIcons();
    clearTimeout(toast._t);
    toast._t = setTimeout(function () { t.classList.add('is-hidden'); }, 2600);
  }

  /* ----------------------------- arranque / auth ----------------------------- */
  function waitForGoogle(cb) {
    if (window.google && google.accounts && google.accounts.id) return cb();
    setTimeout(function () { waitForGoogle(cb); }, 120);
  }

  function start() {
    showScreen('screen-login');
    $('btn-login').addEventListener('click', function () { Auth.prompt($('google-fallback')); });
    $('btn-denied-back').addEventListener('click', function () { Auth.logout(); showScreen('screen-login'); Auth.prompt($('google-fallback')); });
    $('btn-logout').addEventListener('click', function () { Auth.logout(); state.user = null; showScreen('screen-login'); });

    $('month-btn').addEventListener('click', function (e) { e.stopPropagation(); toggleMonth(); });
    document.addEventListener('click', function () { if (state.monthOpen) { state.monthOpen = false; $('month-menu').classList.add('is-hidden'); } });

    buildNav();

    if (window.GENOVA_CONFIG.DEMO_MODE) {
      $('btn-login').addEventListener('click', onCredential);
      onCredential();
      return;
    }

    waitForGoogle(function () {
      try { Auth.init(onCredential); }
      catch (err) { toast(err.message, true); }
    });
  }

  function onCredential() {
    showScreen('screen-booting');
    Api.bootstrap().then(function (data) {
      state.user = data.user;
      state.lists = data.lists;
      var now = new Date();
      state.period.anio = now.getFullYear();
      state.period.mes = now.getMonth() + 1;
      enterApp();
    }).catch(function (err) {
      if (String(err.message).indexOf('ACCESO_DENEGADO') >= 0) {
        var p = Auth.profile() || {};
        $('denied-email').textContent = p.email || '';
        showScreen('screen-denied');
      } else {
        showScreen('screen-login');
        toast(err.message, true);
      }
    });
  }

  function enterApp() {
    var p = Auth.profile() || {};
    var name = p.name || (p.email || '').split('@')[0];
    $('user-name').textContent = name;
    $('user-role').textContent = 'socio · ' + (state.user.rol || 'socio');
    $('user-avatar').textContent = (name || '··').slice(0, 2).toUpperCase();
    $('header-email').textContent = p.email || '';
    showScreen('screen-app');
    buildMonthMenu();
    setRoute('dashboard');
    loadDashboard();
  }

  /* ----------------------------- shell ----------------------------- */
  function buildNav() {
    $('side-nav').innerHTML = NAV.map(function (n) {
      return '<div class="nav-link" data-route="' + n.key + '">' +
        '<span class="ico"><i data-lucide="' + n.icon + '"></i></span><span>' + n.label + '</span></div>';
    }).join('');
    Array.prototype.forEach.call($('side-nav').querySelectorAll('.nav-link'), function (el) {
      el.addEventListener('click', function () { setRoute(el.getAttribute('data-route')); closeNav(); });
    });
    var tog = $('nav-toggle'); if (tog) tog.onclick = function () { document.querySelector('.app-root').classList.toggle('nav-open'); };
    var bd = $('nav-backdrop'); if (bd) bd.onclick = closeNav;
    drawIcons();
  }
  function closeNav() { var r = document.querySelector('.app-root'); if (r) r.classList.remove('nav-open'); }

  function setRoute(route) {
    if (state.route === 'precios' && route !== 'precios' && preciosDirtyCount() > 0) {
      if (!confirm('Se perderán los cambios no guardados al salir')) return; // rechaza: se queda
      state.precios.edits = {}; // acepta: descarta lo no guardado
    }
    if (route !== state.route) { // al cambiar de solapa se vacían los filtros
      state.ventas.filter = 'Todos'; state.ventas.query = '';
      state.mov.filter = 'Todas'; state.mov.iva = 'Todos'; state.mov.query = '';
      state.mpprod.mp.query = ''; state.mpprod.prod.query = ''; state.mpprod.stockQuery = '';
      state.precios.query = ''; state.precios.sel = {}; state.precios.aumento = '';
    }
    state.route = route;
    Array.prototype.forEach.call($('side-nav').querySelectorAll('.nav-link'), function (el) {
      el.classList.toggle('is-active', el.getAttribute('data-route') === route);
    });
    $('header-title').textContent = TITLES[route] || '';
    $('month-picker').classList.toggle('is-hidden', route === 'config' || route === 'precios'); // catálogos: no dependen del período
    $('header-action').classList.add('is-hidden'); // se activa por vista cuando corresponda
    $('header-action2').classList.add('is-hidden');
    renderRoute();
  }

  var HEADER_ACTIONS = {
    ventas: { label: 'Nueva venta', icon: 'plus', fn: function () { openVentaModal(null); } },
    movimientos: { label: 'Nuevo movimiento', icon: 'plus', fn: function () { openMovModal(null); } }
  };
  function applyHeaderAction(route) {
    var ha = $('header-action'), cfg = HEADER_ACTIONS[route];
    if (route === 'mp') {
      cfg = state.mpprod.tab === 'mp'
        ? { label: 'Nueva compra', icon: 'plus', fn: function () { openCompraModal(null); } }
        : { label: 'Registrar producción', icon: 'plus', fn: function () { openProdModal(null); } };
    }
    if (cfg) {
      ha.classList.remove('is-hidden');
      ha.innerHTML = '<span class="ico"><i data-lucide="' + cfg.icon + '"></i></span><span class="btn-label">' + cfg.label + '</span>';
      ha.onclick = cfg.fn;
    } else {
      ha.classList.add('is-hidden');
      ha.onclick = null;
    }
    var ha2 = $('header-action2');
    if (route === 'mp' && state.mpprod.tab === 'mp') {
      ha2.classList.remove('is-hidden');
      ha2.innerHTML = '<span class="ico"><i data-lucide="calculator"></i></span><span class="btn-label">Saldos Finales</span>';
      ha2.onclick = function () { openSaldosModal('mp'); };
    } else {
      ha2.classList.add('is-hidden');
      ha2.onclick = null;
    }
  }

  function renderRoute() {
    applyHeaderAction(state.route);
    if (state.route === 'dashboard') return renderDashboard();
    if (state.route === 'ventas') return ensureVentas();
    if (state.route === 'precios') return renderPrecios();
    if (state.route === 'movimientos') return ensureMov();
    if (state.route === 'mp') return ensureMpProd();
    if (state.route === 'config') return renderConfig();
    $('view').innerHTML = '<div class="placeholder"><span class="ico"><i data-lucide="hammer"></i></span>' +
      '<div>Vista «' + escapeHtml(TITLES[state.route]) + '» en construcción.</div></div>';
    drawIcons();
  }

  function precioOrig(r) { return r['Precio'] == null ? '' : String(r['Precio']); }
  function preciosDirtyCount() { return Object.keys(state.precios.edits || {}).length; }

  function renderPrecios() {
    var all = productosLista();
    var admin = isAdmin();
    var q = state.precios.query.trim().toLowerCase();
    var rows = all.filter(function (r) {
      return q === '' || [r['Categoría'], r['Artículo'], r['Producto']].some(function (v) {
        return String(v || '').toLowerCase().indexOf(q) >= 0;
      });
    });
    var search = '<div class="filters" style="margin-bottom:16px;"><div class="search-box">' +
      '<span class="ico"><i data-lucide="search"></i></span>' +
      '<input id="precios-search" placeholder="Buscar producto…" value="' + escapeHtml(state.precios.query) + '"></div>' +
      (admin ? '<div class="aumento-box"><span class="aumento-lbl">Aumento %</span>' +
        '<input id="precios-aumento" inputmode="decimal" placeholder="0" value="' + escapeHtml(state.precios.aumento || '') + '">' +
        '<button class="btn-plus" id="precios-aplicar" title="Aplicar aumento a los tildados">+</button></div>' : '') +
      '<button class="btn btn-secondary" id="precios-pdf" style="margin-left:auto;"><span class="ico"><i data-lucide="file-text"></i></span>Lista de precios</button>' +
      (admin ? '<button class="btn btn-primary" id="precios-save" disabled><span class="ico"><i data-lucide="save"></i></span>Guardar cambios</button>' : '') +
      '</div>';
    var body;
    if (!all.length) {
      body = emptyHtml('tag', 'Sin productos', 'Cargá productos en Configuración → Productos terminados.');
    } else if (!rows.length) {
      body = search + emptyHtml('tag', 'Sin resultados', 'Probá con otro término de búsqueda.');
    } else {
      var note = admin
        ? '<div class="cfg-sub" style="margin-bottom:14px;">Editá los precios y presioná «Guardar cambios». Los campos modificados se marcan en rojo.</div>'
        : '<div class="notice notice-info" style="margin-bottom:14px;"><span class="ico" style="width:16px;height:16px;"><i data-lucide="lock-keyhole"></i></span>Sólo un administrador puede editar los precios.</div>';
      var sel = state.precios.sel || {};
      var head = '<div class="dt-head">' +
        (admin ? '<div><input type="checkbox" class="precio-check-all"></div>' : '') +
        '<div>Categoría</div><div>Artículo</div><div>Producto</div><div class="r-right">Precio</div></div>';
      var edits = state.precios.edits || {};
      var trs = rows.map(function (r) {
        var edited = edits[r._row] !== undefined;
        var val = edited ? edits[r._row] : precioOrig(r);
        var dirty = edited && String(edits[r._row]) !== precioOrig(r) ? ' is-dirty' : '';
        var precioCell = admin
          ? '<input class="fld-input mono precio-input' + dirty + '" data-row="' + r._row + '" inputmode="decimal" value="' + escapeHtml(val) + '">'
          : '<span class="num strong">' + (r['Precio'] ? money(r['Precio']) : '—') + '</span>';
        return '<div class="dt-row">' +
          (admin ? '<div><input type="checkbox" class="precio-check" data-row="' + r._row + '"' + (sel[r._row] ? ' checked' : '') + '></div>' : '') +
          '<div class="muted">' + escapeHtml(r['Categoría'] || '—') + '</div>' +
          '<div style="font-weight:500;">' + escapeHtml(r['Artículo'] || '') + '</div>' +
          '<div>' + escapeHtml(r['Producto'] || '') + '</div>' +
          '<div class="r-right">' + precioCell + '</div>' +
          '</div>';
      }).join('');
      body = search + note + '<div class="data-table tbl-precios' + (admin ? ' has-sel' : '') + '">' + head + trs + '</div>';
    }
    $('view').innerHTML = body;
    var ps = $('precios-search');
    if (ps) ps.addEventListener('input', function () {
      state.precios.query = ps.value;
      renderPrecios();
      var ns = $('precios-search'); if (ns) { ns.focus(); ns.setSelectionRange(ns.value.length, ns.value.length); }
    });
    var pdf = $('precios-pdf'); if (pdf) pdf.onclick = pdfListaPrecios;
    if (admin) {
      var updateSaveBtn = function () { var b = $('precios-save'); if (b) b.disabled = preciosDirtyCount() === 0; };
      updateSaveBtn();
      Array.prototype.forEach.call($('view').querySelectorAll('.precio-input'), function (el) {
        var rowNum = Number(el.getAttribute('data-row'));
        var orig = precioOrig((productosLista().filter(function (r) { return r._row === rowNum; })[0]) || {});
        el.addEventListener('input', function () {
          if (el.value === orig) delete state.precios.edits[rowNum];
          else state.precios.edits[rowNum] = el.value;
          el.classList.toggle('is-dirty', el.value !== orig);
          updateSaveBtn();
        });
      });
      var au = $('precios-aumento'); if (au) au.addEventListener('input', function () { state.precios.aumento = au.value; });
      var ap = $('precios-aplicar'); if (ap) ap.onclick = aplicarAumento;
      Array.prototype.forEach.call($('view').querySelectorAll('.precio-check'), function (el) {
        el.addEventListener('change', function () {
          var rowNum = Number(el.getAttribute('data-row'));
          if (el.checked) state.precios.sel[rowNum] = true; else delete state.precios.sel[rowNum];
        });
      });
      var all = $('view').querySelector('.precio-check-all');
      if (all) all.addEventListener('change', function () {
        var on = all.checked;
        Array.prototype.forEach.call($('view').querySelectorAll('.precio-check'), function (el) {
          el.checked = on; var rowNum = Number(el.getAttribute('data-row'));
          if (on) state.precios.sel[rowNum] = true; else delete state.precios.sel[rowNum];
        });
      });
      var sb = $('precios-save'); if (sb) sb.onclick = function () { savePreciosAll(sb); };
    }
    drawIcons();
  }

  // Aumenta el precio de los productos tildados por el % ingresado (queda sin guardar, en rojo).
  function aplicarAumento() {
    var pct = toNum(($('precios-aumento') || {}).value);
    if (!pct) { toast('Ingresá un porcentaje de aumento', true); return; }
    var sel = state.precios.sel || {};
    var keys = Object.keys(sel).filter(function (k) { return sel[k]; });
    if (!keys.length) { toast('Tildá al menos un producto', true); return; }
    var factor = 1 + pct / 100;
    keys.forEach(function (k) {
      var rowNum = Number(k);
      var p = productosLista().filter(function (r) { return r._row === rowNum; })[0];
      if (!p) return;
      var orig = precioOrig(p);
      var cur = state.precios.edits[rowNum] !== undefined ? state.precios.edits[rowNum] : orig;
      var nuevo = Math.round(toNum(cur) * factor * 100) / 100;
      var nuevoStr = String(nuevo);
      if (nuevoStr === orig) delete state.precios.edits[rowNum];
      else state.precios.edits[rowNum] = nuevoStr;
    });
    renderPrecios();
    toast('Aumento aplicado · revisá y guardá');
  }

  function savePreciosAll(btn) {
    var edits = state.precios.edits || {}, keys = Object.keys(edits);
    if (!keys.length) return;
    setBtnLoading(btn, true, 'Guardar cambios');
    Promise.all(keys.map(function (k) {
      var rowNum = Number(k), precio = toNum(edits[k]);
      return Api.update('ListaProd', rowNum, { 'Precio': precio }).then(function () {
        var p = productosLista().filter(function (r) { return r._row === rowNum; })[0];
        if (p) p['Precio'] = precio;
      });
    })).then(function () {
      state.precios.edits = {};
      toast('Precios guardados');
      renderPrecios();
    }).catch(function (err) { setBtnLoading(btn, false, 'Guardar cambios'); toast(err.message, true); });
  }

  // PDF: Lista de precios de productos, ordenada por categoría/artículo/producto.
  function pdfListaPrecios() {
    var esc = escapeHtml;
    var mesNom = MONTHS[state.period.mes - 1], anio = state.period.anio;
    var rows = productosLista().slice().sort(function (a, b) {
      return (String(a['Categoría'] || '') + String(a['Artículo'] || '') + String(a['Producto'] || ''))
        .localeCompare(String(b['Categoría'] || '') + String(b['Artículo'] || '') + String(b['Producto'] || ''));
    });
    var body = rows.length
      ? rows.map(function (r) {
          return '<tr>' +
            '<td>' + esc(r['Categoría'] || '') + '</td>' +
            '<td>' + esc(r['Artículo'] || '') + '</td>' +
            '<td>' + esc(r['Producto'] || '') + '</td>' +
            '<td class="num">' + (r['Kg por envase'] != null && r['Kg por envase'] !== '' ? esc(String(r['Kg por envase'])) : '—') + '</td>' +
            '<td class="num">' + (r['Precio'] ? money(r['Precio']) : '—') + '</td></tr>';
        }).join('')
      : '<tr><td colspan="5" class="empty">Sin productos cargados.</td></tr>';
    var section = '<section class="poe"><h2>Lista de precios</h2>' +
      '<table><thead><tr><th>Categoría</th><th>Artículo</th><th>Producto</th><th class="num">Kg por envase</th><th class="num">Precio</th></tr></thead>' +
      '<tbody>' + body + '</tbody></table></section>';
    openPrintDoc('Lista de precios · ' + mesNom + ' ' + anio, 'Lista de precios · ' + mesNom + ' ' + anio, section);
  }

  function loadingView() {
    $('view').innerHTML = '<div class="placeholder"><span class="ico"><i data-lucide="loader"></i></span><div>Cargando…</div></div>';
    drawIcons();
  }

  function toggleMonth() {
    state.monthOpen = !state.monthOpen;
    $('month-menu').classList.toggle('is-hidden', !state.monthOpen);
  }

  function buildMonthMenu() {
    var a = state.period.anio;
    $('month-menu').innerHTML = MONTHS.map(function (m, i) {
      return '<div class="month-opt' + (i + 1 === state.period.mes ? ' is-active' : '') + '" data-mes="' + (i + 1) + '">' + m + ' ' + a + '</div>';
    }).join('');
    Array.prototype.forEach.call($('month-menu').querySelectorAll('.month-opt'), function (el) {
      el.addEventListener('click', function (e) {
        e.stopPropagation();
        state.period.mes = Number(el.getAttribute('data-mes'));
        state.monthOpen = false;
        $('month-menu').classList.add('is-hidden');
        updateMonthLabel();
        buildMonthMenu();
        renderRoute(); // recálculo/refiltrado automático de la vista activa
      });
    });
    updateMonthLabel();
  }
  function updateMonthLabel() {
    $('month-label').textContent = MONTHS[state.period.mes - 1] + ' ' + state.period.anio;
  }

  /* ----------------------------- dashboard ----------------------------- */
  function loadDashboard() {
    showLoader(true);
    Api.dashboard(state.period.anio).then(function (data) {
      state.dash = data;
      showLoader(false);
      if (state.route === 'dashboard') renderDashboard();
    }).catch(function (err) {
      showLoader(false);
      toast(err.message, true);
    });
  }

  function sumBy(rows, field, mes, mesField) {
    mesField = mesField || 'MES';
    return rows.reduce(function (a, r) {
      if (mes != null && Number(r[mesField]) !== mes) return a;
      return a + toNum(r[field]);
    }, 0);
  }
  function movSum(rows, clasif, mes) {
    return rows.reduce(function (a, r) {
      if (Number(r['MES']) !== mes) return a;
      if (String(r['Clasif']) !== clasif) return a;
      return a + toNum(r['Monto']);
    }, 0);
  }

  function computeKpis(d, mes) {
    var ventas = d.ventas || [], movs = d.movimientos || [], mp = d.mp || [], prod = d.prod || [];

    var ventasMes = sumBy(ventas, 'Totales', mes);
    var ventasAcum = ventas.reduce(function (a, r) { return Number(r['MES']) <= mes ? a + toNum(r['Totales']) : a; }, 0);

    var mpMes = sumBy(mp, 'Total', mes, 'Mes');
    var sueldos = movSum(movs, 'Sueldos', mes);
    var cf = movSum(movs, 'CF', mes);
    var gAdm = movSum(movs, 'Gastos Administrativos', mes);
    var gCom = movSum(movs, 'Gastos Comercialización', mes);
    var gFin = movSum(movs, 'Gastos Financieros', mes);
    var otrosIng = movSum(movs, 'Otros Ing No Operativos', mes);
    var otrosGtos = movSum(movs, 'Otros Gtos No Operativos', mes);

    var utBruta = ventasMes - mpMes - sueldos - cf;
    var utOp = utBruta - gAdm - gCom;
    var neto = utOp + otrosIng - gFin - otrosGtos;
    var safe = function (x) { return ventasMes ? x / ventasMes : 0; };

    // mix de cobro (EFVO / Tarj o cta / MP)
    var efvo = sumBy(ventas, 'EFVO', mes), tarj = sumBy(ventas, 'Tarj o cta', mes), mpago = sumBy(ventas, 'MP', mes);
    var cobroTot = efvo + tarj + mpago || 1;

    // producción por artículo
    var byArt = {};
    prod.forEach(function (r) { if (Number(r['Mes']) === mes) { var k = r['Artículo'] || '—'; byArt[k] = (byArt[k] || 0) + toNum(r['Unidades']); } });
    var prodArr = Object.keys(byArt).map(function (k) { return { name: k, val: byArt[k] }; }).sort(function (a, b) { return b.val - a.val; });
    var prodTotal = prodArr.reduce(function (a, x) { return a + x.val; }, 0);

    // canal dominante (por Totales)
    var byCat = {};
    ventas.forEach(function (r) { if (Number(r['MES']) === mes) { var k = r['cat'] || '—'; byCat[k] = (byCat[k] || 0) + toNum(r['Totales']); } });
    var domCat = Object.keys(byCat).sort(function (a, b) { return byCat[b] - byCat[a]; })[0] || '—';
    var domPct = ventasMes ? byCat[domCat] / ventasMes : 0;

    return {
      ventasMes: ventasMes, ventasAcum: ventasAcum,
      mpMes: mpMes, sueldos: sueldos, cf: cf, gAdm: gAdm, gCom: gCom, gFin: gFin, otrosGtos: otrosGtos,
      utBruta: utBruta, utOp: utOp, neto: neto,
      margenBruto: safe(utBruta), margenOp: safe(utOp), margenNeto: safe(neto),
      mix: { efvo: efvo / cobroTot, tarj: tarj / cobroTot, mpago: mpago / cobroTot },
      prodArr: prodArr, prodTotal: prodTotal,
      domCat: domCat, domPct: domPct
    };
  }

  function delta(cur, prev) {
    if (!prev) return { txt: cur ? 'nuevo' : 'estable', cls: 'delta-flat', ico: 'minus' };
    var dv = (cur - prev) / Math.abs(prev);
    if (Math.abs(dv) < 0.001) return { txt: 'estable', cls: 'delta-flat', ico: 'minus' };
    var up = dv > 0;
    return { txt: (up ? '+' : '') + (dv * 100).toLocaleString('es-AR', { maximumFractionDigits: 1 }) + '%', cls: up ? 'delta-up' : 'delta-down', ico: up ? 'trending-up' : 'trending-down' };
  }
  function deltaPP(cur, prev) {
    var dv = (cur - prev) * 100;
    if (Math.abs(dv) < 0.05) return { txt: 'estable', cls: 'delta-flat', ico: 'minus' };
    var up = dv > 0;
    return { txt: (up ? '+' : '') + dv.toLocaleString('es-AR', { maximumFractionDigits: 1 }) + ' pp', cls: up ? 'delta-up' : 'delta-down', ico: up ? 'trending-up' : 'trending-down' };
  }

  function renderDashboard() {
    if (!state.dash) { $('view').innerHTML = '<div class="placeholder"><span class="ico"><i data-lucide="loader"></i></span><div>Cargando datos…</div></div>'; drawIcons(); return; }
    var mes = state.period.mes;
    var k = computeKpis(state.dash, mes);
    var kPrev = mes > 1 ? computeKpis(state.dash, mes - 1) : null;

    var heroDelta = kPrev ? delta(k.ventasMes, kPrev.ventasMes) : { txt: '—', cls: '', ico: 'minus' };
    var dBruto = kPrev ? deltaPP(k.margenBruto, kPrev.margenBruto) : { txt: '—', cls: 'delta-flat', ico: 'minus' };
    var dNeto = kPrev ? deltaPP(k.margenNeto, kPrev.margenNeto) : { txt: '—', cls: 'delta-flat', ico: 'minus' };
    var dSueldos = kPrev ? delta(k.sueldos, kPrev.sueldos) : { txt: '—', cls: 'delta-flat', ico: 'minus' };
    var dProd = kPrev ? delta(k.prodTotal, kPrev.prodTotal) : { txt: '—', cls: 'delta-flat', ico: 'minus' };

    var minis = [
      { label: 'Margen bruto', hint: 'Ventas menos costo de producción', value: pct(k.margenBruto), d: dBruto, accent: 'bg-accent' },
      { label: 'Margen neto', hint: 'Ganancia final tras todos los gastos', value: pct(k.margenNeto), d: dNeto, accent: 'bg-primary' },
      { label: 'Total sueldos', value: moneyShort(k.sueldos), d: dSueldos, accent: 'bg-accent' },
      { label: 'Canal dominante', value: k.domCat, d: { txt: pct(k.domPct) + ' mix', cls: 'delta-flat', ico: 'circle' }, accent: 'bg-ink' },
      { label: 'Unidades prod.', value: num(k.prodTotal), d: dProd, accent: 'bg-primary' }
    ];

    var html = '' +
      '<div class="dash-toprow">' +
        '<div class="dash-hero">' +
          '<div class="hero-head"><div class="hero-label">Ventas del mes</div>' +
            '<div class="hero-delta ' + (heroDelta.cls === 'delta-down' ? 'down' : '') + '"><span class="ico"><i data-lucide="' + heroDelta.ico + '"></i></span>' + heroDelta.txt + '</div></div>' +
          '<div><div class="hero-value">' + money(k.ventasMes) + '</div>' +
            '<div class="hero-sub">acumulado del año ' + money(k.ventasAcum) + ' · ' + MONTHS[mes - 1].toLowerCase() + '</div>' +
            '<div class="hero-tags">' +
              '<span class="hero-tag gold">' + escapeHtml(k.domCat) + ' ' + pct(k.domPct) + '</span>' +
              '<span class="hero-tag muted">' + num(k.prodTotal) + ' u producidas</span>' +
            '</div></div>' +
        '</div>' +
        '<div class="kpi-mini-grid">' + minis.map(function (m) {
          return '<div class="kpi-mini"><div class="kpi-mini-accent ' + m.accent + '"></div>' +
            '<div class="kpi-mini-body"><div class="kpi-mini-label">' + m.label + '</div>' +
            (m.hint ? '<div class="kpi-mini-hint">' + escapeHtml(m.hint) + '</div>' : '') +
            '<div class="kpi-mini-value">' + escapeHtml(m.value) + '</div>' +
            '<div class="kpi-mini-delta ' + m.d.cls + '"><span class="ico"><i data-lucide="' + m.d.ico + '"></i></span>' + m.d.txt + '</div></div></div>';
        }).join('') + '</div>' +
      '</div>' +
      '<div class="dash-charts">' +
        chartVentasCanal(state.dash, mes) +
        chartMargenes(state.dash, mes) +
        chartMix(k) +
      '</div>' +
      '<div class="dash-bottom">' +
        cardTopProd(k) +
        cardCostos(k) +
      '</div>';

    $('view').innerHTML = html;
    drawIcons();
  }

  function chartVentasCanal(d, mes) {
    var from = Math.max(1, mes - 5);
    var cols = [];
    var maxStack = 1;
    for (var m = from; m <= mes; m++) {
      var may = 0, min = 0, onl = 0;
      (d.ventas || []).forEach(function (r) {
        if (Number(r['MES']) !== m) return;
        var t = toNum(r['Totales']), c = r['cat'];
        if (c === 'Mayorista') may += t; else if (c === 'Minorista') min += t; else onl += t;
      });
      var tot = may + min + onl; if (tot > maxStack) maxStack = tot;
      cols.push({ m: MONTHS_SHORT[m - 1], may: may, min: min, onl: onl });
    }
    var H = 120;
    var bars = cols.map(function (c) {
      var h = function (v) { return 'height:' + (maxStack ? (v / maxStack * H) : 0) + 'px;'; };
      return '<div class="bar-col"><div class="bar-stack">' +
        '<div class="bar-seg top bg-ink" style="' + h(c.may) + '"></div>' +
        '<div class="bar-seg bg-primary" style="' + h(c.min) + '"></div>' +
        '<div class="bar-seg bot bg-accent" style="' + h(c.onl) + '"></div>' +
        '</div><div class="bar-label">' + c.m + '</div></div>';
    }).join('');
    return '<div class="chart-card"><div class="chart-title">Ventas por canal</div>' +
      '<div class="chart-sub">últimos ' + cols.length + ' meses · barras apiladas</div>' +
      '<div class="bars">' + bars + '</div>' +
      '<div class="chart-legend">' +
        '<span class="legend-item"><span class="legend-dot bg-ink"></span>Mayorista</span>' +
        '<span class="legend-item"><span class="legend-dot bg-primary"></span>Minorista</span>' +
        '<span class="legend-item"><span class="legend-dot bg-accent"></span>Online</span>' +
      '</div></div>';
  }

  function chartMargenes(d, mes) {
    var n = mes, pts = [];
    for (var m = 1; m <= n; m++) { var km = computeKpis(d, m); pts.push({ b: km.margenBruto, net: km.margenNeto }); }
    var W = 300, scale = function (v) { return 150 - Math.max(0, Math.min(v, 0.6)) / 0.6 * 120; };
    var xpos = function (i) { return n > 1 ? i * (W / (n - 1)) : W / 2; };
    var line = function (key, color) {
      var p = pts.map(function (pt, i) { return xpos(i) + ',' + scale(pt[key]).toFixed(1); }).join(' ');
      var last = pts[pts.length - 1];
      return '<polyline points="' + p + '" fill="none" stroke="' + color + '" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"></polyline>' +
        '<circle cx="' + xpos(n - 1).toFixed(1) + '" cy="' + scale(last[key]).toFixed(1) + '" r="3.5" fill="' + color + '"></circle>';
    };
    var lastK = pts[pts.length - 1] || { b: 0, net: 0 };
    return '<div class="chart-card"><div class="chart-title">Evolución de márgenes</div>' +
      '<div class="chart-sub">bruto vs. neto</div>' +
      '<svg viewBox="0 0 300 150" style="width:100%; height:150px; overflow:visible;">' +
        '<line x1="0" y1="37" x2="300" y2="37" stroke="#F2E9D8"></line>' +
        '<line x1="0" y1="75" x2="300" y2="75" stroke="#F2E9D8"></line>' +
        '<line x1="0" y1="113" x2="300" y2="113" stroke="#F2E9D8"></line>' +
        line('b', '#C8102E') + line('net', '#B98A1E') +
      '</svg>' +
      '<div class="chart-legend">' +
        '<span class="legend-item"><span class="legend-line bg-primary"></span>Bruto ' + pct(lastK.b) + '</span>' +
        '<span class="legend-item"><span class="legend-line" style="background:var(--color-accent-700)"></span>Neto ' + pct(lastK.net) + '</span>' +
      '</div></div>';
  }

  function chartMix(k) {
    var e = k.mix.efvo, t = k.mix.tarj, c = k.mix.mpago;
    return '<div class="chart-card"><div class="chart-title">Mix de cobro</div>' +
      '<div class="chart-sub">efectivo · tarjeta/cta · MP</div>' +
      '<div style="display:flex; height:26px; border-radius:6px; overflow:hidden; margin:18px 0 6px;">' +
        '<div class="bg-ink" style="width:' + (e * 100) + '%"></div>' +
        '<div class="bg-primary" style="width:' + (t * 100) + '%"></div>' +
        '<div class="bg-accent" style="width:' + (c * 100) + '%"></div>' +
      '</div>' +
      '<div class="chart-legend">' +
        '<span class="legend-item"><span class="legend-dot bg-ink"></span>Efvo ' + pct(e) + '</span>' +
        '<span class="legend-item"><span class="legend-dot bg-primary"></span>Tarjeta ' + pct(t) + '</span>' +
        '<span class="legend-item"><span class="legend-dot bg-accent"></span>MP ' + pct(c) + '</span>' +
      '</div></div>';
  }

  function cardTopProd(k) {
    var max = (k.prodArr[0] && k.prodArr[0].val) || 1;
    var rows = k.prodArr.slice(0, 5).map(function (p) {
      return '<div class="topprod-row"><div class="topprod-name">' + escapeHtml(p.name) + '</div>' +
        '<div class="topprod-track"><div class="topprod-fill" style="width:' + (p.val / max * 100) + '%"></div></div>' +
        '<div class="topprod-val">' + num(p.val) + '</div></div>';
    }).join('') || '<div class="empty-sub">Sin producción registrada este mes.</div>';
    return '<div class="chart-card"><div class="chart-title" style="margin-bottom:16px;">Top productos por producción</div>' + rows + '</div>';
  }

  function cardCostos(k) {
    var segs = [
      { l: 'Materia prima', v: k.mpMes, c: 'var(--color-ink)' },
      { l: 'Sueldos', v: k.sueldos, c: 'var(--color-primary)' },
      { l: 'Costos fijos', v: k.cf, c: 'var(--color-accent)' },
      { l: 'Comercialización', v: k.gCom, c: 'var(--color-accent-700)' },
      { l: 'Otros', v: k.gAdm + k.gFin + k.otrosGtos, c: '#DACFBA' }
    ];
    var total = segs.reduce(function (a, s) { return a + s.v; }, 0) || 1;
    var acc = 0, stops = segs.map(function (s) {
      var from = acc / total * 100, to = (acc + s.v) / total * 100; acc += s.v;
      return s.c + ' ' + from.toFixed(1) + '% ' + to.toFixed(1) + '%';
    }).join(', ');
    var legend = segs.map(function (s) {
      return '<span class="legend-item"><span class="legend-dot" style="background:' + s.c + '"></span>' + s.l + ' · ' + pct(s.v / total) + '</span>';
    }).join('');
    return '<div class="chart-card donut-card">' +
      '<div class="donut" style="background:conic-gradient(' + stops + ')">' +
        '<div class="donut-hole"><div class="v">' + moneyShort(total) + '</div><div class="l">costos</div></div></div>' +
      '<div><div class="chart-title" style="margin-bottom:13px;">Estructura de costos</div>' +
        '<div class="cost-legend">' + legend + '</div></div></div>';
  }

  /* ----------------------------- fechas ----------------------------- */
  function isoToShort(iso) { // 'YYYY-MM-DD' -> 'DD/MM'
    var m = String(iso || '').match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
    return m ? (('0' + m[3]).slice(-2) + '/' + ('0' + m[2]).slice(-2)) : String(iso || '');
  }
  var DAYS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
  function fechaDiaNombre(iso) { // 'YYYY-MM-DD' -> 'Miércoles, 01/07'
    var m = String(iso || '').match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
    if (!m) return String(iso || '');
    var d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    return DAYS[d.getDay()] + ', ' + ('0' + m[3]).slice(-2) + '/' + ('0' + m[2]).slice(-2);
  }
  function isoToInput(iso) { // 'YYYY-MM-DD' -> 'DD/MM/YYYY'
    var m = String(iso || '').match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
    return m ? (('0' + m[3]).slice(-2) + '/' + ('0' + m[2]).slice(-2) + '/' + m[1]) : String(iso || '');
  }
  // Normaliza a 'DD/MM/AAAA'. Si viene 'DD/MM' (sin año) usa el año en curso.
  // Si viene 'DD/MM/AAAA' respeta el año ingresado. Devuelve null si es inválida.
  function normalizeFecha(s) {
    s = String(s || '').trim();
    var m3 = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (m3) return ('0' + m3[1]).slice(-2) + '/' + ('0' + m3[2]).slice(-2) + '/' + m3[3];
    var m2 = s.match(/^(\d{1,2})\/(\d{1,2})$/);
    if (m2) return ('0' + m2[1]).slice(-2) + '/' + ('0' + m2[2]).slice(-2) + '/' + (new Date().getFullYear());
    return null;
  }
  // ¿La fecha (ISO 'YYYY-MM-DD') cae en el mes/año seleccionado en el header?
  function inPeriod(fechaIso) {
    return Number(String(fechaIso || '').slice(0, 4)) === state.period.anio &&
           Number(String(fechaIso || '').slice(5, 7)) === state.period.mes;
  }

  function catBadgeClass(cat) {
    var map = { Minorista: 'badge-minorista', Mayorista: 'badge-mayorista', Online: 'badge-online' };
    return map[cat] || 'badge-neutral';
  }
  function categorias() {
    var set = {};
    ((state.lists && state.lists.canales) || []).forEach(function (c) { if (c['Categoría']) set[c['Categoría']] = 1; });
    ((state.ventas.rows) || []).forEach(function (r) { if (r['cat']) set[r['cat']] = 1; });
    return Object.keys(set);
  }

  /* ----------------------------- ventas ----------------------------- */
  function ensureVentas() {
    if (state.ventas.rows == null) { loadingView(); return loadVentas(); }
    renderVentas();
  }
  function loadVentas(silent) {
    if (!silent) showLoader(true);
    return Api.list('VENTAS').then(function (rows) {
      state.ventas.rows = rows;
      showLoader(false);
      if (state.route === 'ventas') renderVentas();
    }).catch(function (err) { showLoader(false); toast(err.message, true); });
  }

  function renderVentas() {
    var rows = state.ventas.rows || [];
    var f = state.ventas.filter, q = state.ventas.query.trim().toLowerCase();
    var view = rows.filter(function (r) {
      return inPeriod(r['Fecha']) && (f === 'Todos' || r['cat'] === f) && (q === '' || String(r['Lista/Canal'] || '').toLowerCase().indexOf(q) >= 0);
    }).sort(function (a, b) { return String(a['Fecha'] || '').localeCompare(String(b['Fecha'] || '')); });

    var chips = ['Todos'].concat(categorias()).map(function (c) {
      return '<span class="chip' + (c === f ? ' is-active' : '') + '" data-chip="' + escapeHtml(c) + '">' + escapeHtml(c) + '</span>';
    }).join('');

    var filters = '<div class="filters"><span class="filters-label">Canal</span>' + chips +
      '<div class="search-box"><span class="ico"><i data-lucide="search"></i></span>' +
      '<input id="ventas-search" placeholder="Buscar cliente…" value="' + escapeHtml(state.ventas.query) + '"></div>' +
      '<button class="btn btn-secondary" id="ventas-salida" style="margin-left:auto;"><span class="ico"><i data-lucide="file-text"></i></span>Salida</button></div>';

    var body;
    if (view.length === 0) {
      body = '<div class="empty-state"><div class="empty-ico"><span class="ico"><i data-lucide="receipt-text"></i></span></div>' +
        '<div class="empty-title">Sin ventas para este filtro</div>' +
        '<div class="empty-sub">Probá con otro canal o limpiá la búsqueda.</div>' +
        '<button class="btn btn-secondary" id="ventas-clear">Quitar filtros</button></div>';
    } else {
      var total = view.reduce(function (a, r) { return a + toNum(r['Totales']); }, 0);
      var head = '<div class="dt-head"><div>Fecha</div><div>Canal / Cliente</div>' +
        '<div class="r-right">Efectivo</div><div class="r-right">Tarjeta/Transf.</div><div class="r-right">Cuenta</div>' +
        '<div class="r-right">Total</div><div>Categoría</div><div></div></div>';
      var trs = view.map(function (r) {
        return '<div class="dt-row">' +
          '<div class="date">' + isoToShort(r['Fecha']) + '</div>' +
          '<div style="font-weight:500;">' + escapeHtml(r['Lista/Canal']) +
            (r['Producto'] ? '<div class="muted" style="font-size:11.5px;">' + escapeHtml(r['Producto']) + (toNum(r['Cantidad']) ? ' ×' + escapeHtml(String(r['Cantidad'])) : '') + (r['Lote'] ? ' · ' + escapeHtml(r['Lote']) : '') + (toNum(r['Total venta']) ? ' · ' + money(r['Total venta']) : '') + '</div>' : '') +
          '</div>' +
          '<div class="num muted">' + money(r['EFVO']) + '</div>' +
          '<div class="num muted">' + money(r['Tarj o cta']) + '</div>' +
          '<div class="num muted">' + money(r['MP']) + '</div>' +
          '<div class="num strong">' + money(r['Totales']) + '</div>' +
          '<div><span class="badge badge-sm ' + catBadgeClass(r['cat']) + '">' + escapeHtml(r['cat'] || '—') + '</span></div>' +
          '<div class="row-actions">' +
            '<span class="icon-btn" data-edit="' + r._row + '"><span class="ico"><i data-lucide="pencil"></i></span></span>' +
            '<span class="icon-btn danger" data-del="' + r._row + '"><span class="ico"><i data-lucide="trash-2"></i></span></span>' +
          '</div></div>';
      }).join('');
      var foot = '<div class="dt-foot"><div>' + view.length + ' ventas</div>' +
        '<div>Total <span class="num strong" style="padding:0; margin-left:6px;">' + money(total) + '</span></div></div>';
      body = '<div class="data-table tbl-ventas">' + head + trs + foot + '</div>';
    }

    $('view').innerHTML = filters + body;
    wireVentas();
    drawIcons();
  }

  function wireVentas() {
    var v = $('view');
    Array.prototype.forEach.call(v.querySelectorAll('[data-chip]'), function (el) {
      el.addEventListener('click', function () { state.ventas.filter = el.getAttribute('data-chip'); renderVentas(); });
    });
    var s = $('ventas-search');
    if (s) s.addEventListener('input', function () {
      state.ventas.query = s.value;
      var rows = state.ventas.rows || [], q = s.value.trim().toLowerCase(), f = state.ventas.filter;
      // re-render preservando foco
      renderVentas();
      var ns = $('ventas-search'); if (ns) { ns.focus(); ns.setSelectionRange(ns.value.length, ns.value.length); }
    });
    var clr = $('ventas-clear');
    if (clr) clr.addEventListener('click', function () { state.ventas.filter = 'Todos'; state.ventas.query = ''; renderVentas(); });
    var sal = $('ventas-salida'); if (sal) sal.onclick = pdfSalida;
    Array.prototype.forEach.call(v.querySelectorAll('[data-edit]'), function (el) {
      el.addEventListener('click', function () { openVentaModal(rowByNum(el.getAttribute('data-edit'))); });
    });
    Array.prototype.forEach.call(v.querySelectorAll('[data-del]'), function (el) {
      el.addEventListener('click', function () { deleteVenta(Number(el.getAttribute('data-del'))); });
    });
  }
  function rowByNum(n) { n = Number(n); return (state.ventas.rows || []).filter(function (r) { return r._row === n; })[0] || null; }

  function precioDe(prod) { var p = productosLista().filter(function (x) { return x['Producto'] === prod; })[0]; return p ? toNum(p['Precio']) : 0; }

  function openVentaModal(row) {
    // Stock por lote: necesitamos producción cargada para saber qué productos/lotes tienen stock.
    if (state.mpprod.prod.rows == null) {
      showLoader(true);
      Api.list('PROD').then(function (rows) { state.mpprod.prod.rows = rows; showLoader(false); openVentaModal(row); })
        .catch(function (e) { showLoader(false); toast(e.message, true); });
      return;
    }
    var ed = !!row;
    var clientes = ((state.lists && state.lists.canales) || []).map(function (c) { return c['Nombre']; });
    var curCliente = (row && row['Lista/Canal']) || '';
    if (curCliente && clientes.indexOf(curCliente) < 0) clientes = [curCliente].concat(clientes);
    var clientOpts = '<option value="">— elegí un cliente —</option>' + clientes.map(function (n) {
      return '<option value="' + escapeHtml(n) + '"' + (n === curCliente ? ' selected' : '') + '>' + escapeHtml(n) + '</option>';
    }).join('');

    // Líneas de venta (varios productos). En edición, una sola línea (la fila).
    var lineas = ed
      ? [{ producto: row['Producto'] || '', lote: row['Lote'] || '', cant: (row['Cantidad'] == null ? '' : String(row['Cantidad'])) }]
      : [{ producto: '', lote: '', cant: '' }];

    function prodOptsWith(sel) {
      var ps = productosConStock();
      if (sel && ps.indexOf(sel) < 0) ps = [sel].concat(ps);
      return '<option value="">— producto —</option>' + ps.map(function (n) {
        return '<option value="' + escapeHtml(n) + '"' + (n === sel ? ' selected' : '') + '>' + escapeHtml(n) + '</option>';
      }).join('');
    }
    function loteOptsFor(prod, sel) {
      var lotes = prod ? lotesConStock(prod) : [];
      if (prod && sel && !lotes.some(function (l) { return l.lote === sel; })) lotes = [{ lote: sel, stock: loteStock(prod, sel), vto: '' }].concat(lotes);
      return lotes.length
        ? lotes.map(function (l) { return '<option value="' + escapeHtml(l.lote) + '"' + (l.lote === sel ? ' selected' : '') + '>' + escapeHtml(l.lote) + ' · stock ' + num(l.stock) + (l.vto ? ' · vto ' + escapeHtml(l.vto) : '') + '</option>'; }).join('')
        : '<option value="">— sin stock —</option>';
    }

    var body =
      '<div class="form-grid g-2">' +
        fld('Fecha', '<input id="f-fecha" class="fld-input" placeholder="14/03 o 14/03/2026" value="' + escapeHtml(ed ? isoToInput(row['Fecha']) : '') + '"><div class="fld-err" id="e-fecha"></div>') +
        fld('Cliente', '<select id="f-cliente" class="fld-input">' + clientOpts + '</select><div class="fld-err" id="e-cliente"></div>') +
      '</div>' +
      '<div class="vlinea-head"><div>Producto</div><div>Envase / Lote</div><div>Cant.</div><div style="text-align:right;">Subtotal</div><div></div></div>' +
      '<div id="vlineas"></div>' +
      (ed ? '' : '<button type="button" class="v-addline" id="v-addline">+ Agregar producto</button>') +
      '<div class="vta-total"><span class="vta-total-lbl">Total de la venta</span><span class="vta-total-val" id="f-vtotal">$0</span></div>' +
      '<div class="form-grid g-3" style="margin-bottom:0;">' +
        fld('Efectivo', moneyInput('f-efvo', row && row['EFVO'])) +
        fld('Tarjeta', moneyInput('f-tarj', row && row['Tarj o cta'])) +
        fld('Cuenta', moneyInput('f-cuenta', row && row['MP'])) +
      '</div>';

    openModal({
      title: ed ? 'Editar venta' : 'Nueva venta',
      body: body,
      saveLabel: ed ? 'Guardar cambios' : 'Guardar venta',
      onSave: function (btn) { saveVenta(btn, ed ? row._row : null); }
    });

    function syncFromDom() {
      lineas = [];
      Array.prototype.forEach.call(document.querySelectorAll('#vlineas .vlinea'), function (rowEl) {
        var p = rowEl.querySelector('.vl-prod'); if (!p) return;
        lineas.push({
          producto: p.value,
          lote: (rowEl.querySelector('.vl-lote') || {}).value || '',
          cant: (rowEl.querySelector('.vl-cant') || {}).value || ''
        });
      });
      if (!lineas.length) lineas = [{ producto: '', lote: '', cant: '' }];
    }
    function recalc() {
      var grand = 0;
      Array.prototype.forEach.call(document.querySelectorAll('#vlineas .vlinea'), function (rowEl) {
        var prod = (rowEl.querySelector('.vl-prod') || {}).value || '';
        var cant = toNum((rowEl.querySelector('.vl-cant') || {}).value);
        var sub = precioDe(prod) * cant;
        var subEl = rowEl.querySelector('.vl-sub'); if (subEl) subEl.textContent = money(sub);
        grand += sub;
      });
      $('f-vtotal').textContent = money(grand);
    }
    function renderLineas() {
      $('vlineas').innerHTML = lineas.map(function (L, i) {
        return '<div class="vlinea" data-i="' + i + '">' +
          '<select class="fld-input vl-prod" data-i="' + i + '">' + prodOptsWith(L.producto) + '</select>' +
          '<select class="fld-input vl-lote" data-i="' + i + '">' + loteOptsFor(L.producto, L.lote) + '</select>' +
          '<input class="fld-input mono vl-cant" data-i="' + i + '" inputmode="decimal" placeholder="0" value="' + escapeHtml(L.cant) + '">' +
          '<span class="vl-sub mono"></span>' +
          (lineas.length > 1 ? '<button type="button" class="vl-del" data-i="' + i + '" title="Quitar">✕</button>' : '<span></span>') +
        '</div>';
      }).join('');
      Array.prototype.forEach.call(document.querySelectorAll('#vlineas .vl-prod'), function (el) {
        el.addEventListener('change', function () { syncFromDom(); renderLineas(); recalc(); });
      });
      Array.prototype.forEach.call(document.querySelectorAll('#vlineas .vl-cant'), function (el) {
        el.addEventListener('input', recalc);
      });
      Array.prototype.forEach.call(document.querySelectorAll('#vlineas .vl-del'), function (el) {
        el.addEventListener('click', function () { syncFromDom(); lineas.splice(Number(el.getAttribute('data-i')), 1); renderLineas(); recalc(); });
      });
      recalc();
    }
    renderLineas();
    var add = $('v-addline');
    if (add) add.addEventListener('click', function () { syncFromDom(); lineas.push({ producto: '', lote: '', cant: '' }); renderLineas(); recalc(); });
  }

  function saveVenta(btn, rowNum) {
    var fecha = $('f-fecha').value.trim();
    var cliente = $('f-cliente').value;
    var ok = true;
    var fechaN = normalizeFecha(fecha);
    if (!fechaN) { fieldError('f-fecha', 'e-fecha', 'Fecha DD/MM o DD/MM/AAAA'); ok = false; } else fieldOk('f-fecha', 'e-fecha');
    if (!cliente) { fieldError('f-cliente', 'e-cliente', 'Elegí un cliente'); ok = false; } else fieldOk('f-cliente', 'e-cliente');
    if (!ok) return;

    // Leer las líneas del DOM
    var lns = [];
    Array.prototype.forEach.call(document.querySelectorAll('#vlineas .vlinea'), function (rowEl) {
      var p = rowEl.querySelector('.vl-prod'); if (!p) return;
      lns.push({ producto: p.value, lote: (rowEl.querySelector('.vl-lote') || {}).value || '', cant: toNum((rowEl.querySelector('.vl-cant') || {}).value) });
    });
    if (!lns.length || lns.some(function (L) { return !L.producto || !L.lote || !(L.cant > 0); })) {
      toast('Completá producto, lote y cantidad (>0) en cada línea', true); return;
    }

    var cmatch = ((state.lists && state.lists.canales) || []).filter(function (x) { return x['Nombre'] === cliente; })[0];
    var pago = { EFVO: toNum($('f-efvo').value), 'Tarj o cta': toNum($('f-tarj').value), MP: toNum($('f-cuenta').value) };
    setBtnLoading(btn, true, rowNum ? 'Guardar cambios' : 'Guardar venta');

    if (rowNum) {
      // Edición: una sola línea, actualiza la fila. Respeta total congelado si no cambió producto/cantidad.
      var existing = (state.ventas.rows || []).filter(function (r) { return r._row === rowNum; })[0] || {};
      var cat = cmatch ? (cmatch['Categoría'] || '') : (existing['cat'] || '');
      var L = lns[0];
      var same = existing['Producto'] === L.producto && toNum(existing['Cantidad']) === L.cant;
      var precio = same ? toNum(existing['Precio unit']) : precioDe(L.producto);
      var total = same ? toNum(existing['Total venta']) : L.cant * precio;
      var rec = {
        'Fecha': fechaN, 'Lista/Canal': cliente, 'cat': cat, 'Producto': L.producto, 'Lote': L.lote,
        'Cantidad': L.cant, 'Precio unit': precio, 'Total venta': total,
        'EFVO': pago.EFVO, 'Tarj o cta': pago['Tarj o cta'], 'MP': pago.MP
      };
      Api.update('VENTAS', rowNum, rec).then(function () {
        closeModal(); toast('Venta actualizada'); loadVentas(true);
      }).catch(function (err) { setBtnLoading(btn, false); toast(err.message, true); });
      return;
    }

    // Alta: una fila por línea; el pago va en la primera (para no duplicar el total).
    var cat2 = cmatch ? (cmatch['Categoría'] || '') : '';
    var recs = lns.map(function (L, i) {
      var precio = precioDe(L.producto);
      return {
        'Fecha': fechaN, 'Lista/Canal': cliente, 'cat': cat2, 'Producto': L.producto, 'Lote': L.lote,
        'Cantidad': L.cant, 'Precio unit': precio, 'Total venta': L.cant * precio,
        'EFVO': i === 0 ? pago.EFVO : 0, 'Tarj o cta': i === 0 ? pago['Tarj o cta'] : 0, 'MP': i === 0 ? pago.MP : 0
      };
    });
    Promise.all(recs.map(function (r) { return Api.create('VENTAS', r); })).then(function () {
      closeModal(); toast(recs.length > 1 ? 'Venta guardada (' + recs.length + ' productos)' : 'Venta guardada'); loadVentas(true);
    }).catch(function (err) { setBtnLoading(btn, false); toast(err.message, true); });
  }

  function deleteVenta(rowNum) {
    if (!confirm('¿Eliminar esta venta?')) return;
    showLoader(true);
    Api.remove('VENTAS', rowNum).then(function () {
      showLoader(false); toast('Venta eliminada'); loadVentas(true);
    }).catch(function (err) { showLoader(false); toast(err.message, true); });
  }

  /* ----------------------------- movimientos ----------------------------- */
  var CLASIF_FIJAS = ['Sueldos', 'CF', 'Gastos Administrativos', 'Gastos Comercialización', 'Gastos Financieros', 'Otros Ing No Operativos', 'Otros Gtos No Operativos'];

  function clasifBadgeClass(c) {
    if (c === 'Sueldos') return 'badge-minorista';
    if (c === 'CF' || c === 'Gastos Comercialización') return 'badge-online';
    return 'badge-neutral';
  }
  function ivaTrue(v) { return v === true || /^(s[ií]|true|1)$/i.test(String(v || '').trim()); }
  function glosarioConceptos() {
    return ((state.lists && state.lists.glosario) || []).map(function (g) { return g['Concepto']; }).filter(Boolean);
  }
  function clasificaciones() {
    var set = {};
    ((state.lists && state.lists.glosario) || []).forEach(function (g) { if (g['Clasificación']) set[g['Clasificación']] = 1; });
    ((state.mov.rows) || []).forEach(function (r) { if (r['Clasif']) set[r['Clasif']] = 1; });
    var extras = Object.keys(set).filter(function (c) { return CLASIF_FIJAS.indexOf(c) < 0; });
    return CLASIF_FIJAS.concat(extras);
  }

  function ensureMov() {
    if (state.mov.rows == null) { loadingView(); return loadMov(); }
    renderMov();
  }
  function loadMov(silent) {
    if (!silent) showLoader(true);
    return Api.list('MOVIMIENTOS').then(function (rows) {
      state.mov.rows = rows;
      showLoader(false);
      if (state.route === 'movimientos') renderMov();
    }).catch(function (err) { showLoader(false); toast(err.message, true); });
  }

  function renderMov() {
    var rows = state.mov.rows || [], f = state.mov.filter, iv = state.mov.iva, q = state.mov.query.trim().toLowerCase();
    var view = rows.filter(function (r) {
      var okIva = iv === 'Todos' || (iv === 'Con IVA' ? ivaTrue(r['IVA']) : !ivaTrue(r['IVA']));
      return inPeriod(r['Fecha']) && (f === 'Todas' || r['Clasif'] === f) && okIva &&
        (q === '' || String(r['Observación'] || '').toLowerCase().indexOf(q) >= 0);
    }).sort(function (a, b) { return String(a['Fecha'] || '').localeCompare(String(b['Fecha'] || '')); });

    var chips = ['Todas'].concat(clasificaciones()).map(function (c) {
      return '<span class="chip' + (c === f ? ' is-active' : '') + '" data-chip="' + escapeHtml(c) + '">' + escapeHtml(c) + '</span>';
    }).join('');
    var ivaChips = ['Todos', 'Con IVA', 'Sin IVA'].map(function (c) {
      return '<span class="chip' + (c === iv ? ' is-active' : '') + '" data-ivachip="' + escapeHtml(c) + '">' + escapeHtml(c) + '</span>';
    }).join('');
    var filters = '<div class="filters"><span class="filters-label">Clasificación</span>' + chips +
      '<div class="search-box"><span class="ico"><i data-lucide="search"></i></span>' +
      '<input id="mov-search" placeholder="Buscar observación…" value="' + escapeHtml(state.mov.query) + '"></div></div>' +
      '<div class="filters"><span class="filters-label">IVA</span>' + ivaChips + '</div>';

    var body;
    if (view.length === 0) {
      body = '<div class="empty-state"><div class="empty-ico"><span class="ico"><i data-lucide="arrow-left-right"></i></span></div>' +
        '<div class="empty-title">Sin movimientos en esta clasificación</div>' +
        '<div class="empty-sub">Cambiá de categoría para ver otros registros.</div>' +
        '<button class="btn btn-secondary" id="mov-clear">Ver todas</button></div>';
    } else {
      var head = '<div class="dt-head"><div>Fecha</div><div>Concepto</div><div class="r-right">Monto</div>' +
        '<div class="r-center">IVA</div><div>Clasificación</div><div>Observación</div><div></div></div>';
      var trs = view.map(function (r) {
        var iva = ivaTrue(r['IVA']);
        return '<div class="dt-row">' +
          '<div class="date">' + isoToShort(r['Fecha']) + '</div>' +
          '<div style="font-weight:500;">' + escapeHtml(r['Lista/Concepto']) + '</div>' +
          '<div class="num strong">' + money(r['Monto']) + '</div>' +
          '<div class="r-center">' + (iva
            ? '<span class="iva-on"><span class="ico"><i data-lucide="check"></i></span></span>'
            : '<span class="iva-off"></span>') + '</div>' +
          '<div><span class="badge badge-sm ' + clasifBadgeClass(r['Clasif']) + '">' + escapeHtml(r['Clasif'] || '—') + '</span></div>' +
          '<div class="muted" style="font-size:12.5px;">' + escapeHtml(r['Observación'] || '—') + '</div>' +
          '<div class="row-actions">' +
            '<span class="icon-btn" data-edit="' + r._row + '"><span class="ico"><i data-lucide="pencil"></i></span></span>' +
            '<span class="icon-btn danger" data-del="' + r._row + '"><span class="ico"><i data-lucide="trash-2"></i></span></span>' +
          '</div></div>';
      }).join('');
      var total = view.reduce(function (a, r) { return a + toNum(r['Monto']); }, 0);
      var foot = '<div class="dt-foot"><div>' + view.length + ' movimientos</div>' +
        '<div>Total <span class="num strong" style="padding:0; margin-left:6px;">' + money(total) + '</span></div></div>';
      body = '<div class="data-table tbl-mov">' + head + trs + foot + '</div>';
    }

    $('view').innerHTML = filters + body;
    wireMov();
    drawIcons();
  }

  function wireMov() {
    var v = $('view');
    Array.prototype.forEach.call(v.querySelectorAll('[data-chip]'), function (el) {
      el.addEventListener('click', function () { state.mov.filter = el.getAttribute('data-chip'); renderMov(); });
    });
    Array.prototype.forEach.call(v.querySelectorAll('[data-ivachip]'), function (el) {
      el.addEventListener('click', function () { state.mov.iva = el.getAttribute('data-ivachip'); renderMov(); });
    });
    var s = $('mov-search');
    if (s) s.addEventListener('input', function () {
      state.mov.query = s.value;
      renderMov();
      var ns = $('mov-search'); if (ns) { ns.focus(); ns.setSelectionRange(ns.value.length, ns.value.length); }
    });
    var clr = $('mov-clear');
    if (clr) clr.addEventListener('click', function () { state.mov.filter = 'Todas'; state.mov.iva = 'Todos'; state.mov.query = ''; renderMov(); });
    Array.prototype.forEach.call(v.querySelectorAll('[data-edit]'), function (el) {
      el.addEventListener('click', function () { openMovModal(movByNum(el.getAttribute('data-edit'))); });
    });
    Array.prototype.forEach.call(v.querySelectorAll('[data-del]'), function (el) {
      el.addEventListener('click', function () { deleteMov(Number(el.getAttribute('data-del'))); });
    });
  }
  function movByNum(n) { n = Number(n); return (state.mov.rows || []).filter(function (r) { return r._row === n; })[0] || null; }

  function openMovModal(row) {
    var ed = !!row;
    var clas = clasificaciones();
    var curClas = (row && row['Clasif']) || clas[0];
    var iva = ed ? ivaTrue(row['IVA']) : true;
    var conceptos = glosarioConceptos();
    var datalist = '<datalist id="dl-conceptos">' + conceptos.map(function (c) { return '<option value="' + escapeHtml(c) + '">'; }).join('') + '</datalist>';

    var body =
      '<div class="form-grid g-2">' +
        fld('Fecha', '<input id="f-fecha" class="fld-input" placeholder="14/03 o 14/03/2026" value="' + escapeHtml(ed ? isoToInput(row['Fecha']) : '') + '"><div class="fld-err" id="e-fecha"></div>') +
        fld('Concepto', '<input id="f-concepto" class="fld-input" list="dl-conceptos" placeholder="Descripción del gasto" value="' + escapeHtml(ed ? (row['Lista/Concepto'] || '') : '') + '">' + datalist + '<div class="fld-err" id="e-concepto"></div>') +
      '</div>' +
      '<div class="form-grid" style="grid-template-columns:1fr 170px; align-items:end;">' +
        fld('Monto', moneyInput('f-monto', row && row['Monto']) + '<div class="fld-err" id="e-monto"></div>') +
        '<div class="iva-box' + (iva ? ' is-on' : '') + '" id="f-iva"><span class="iva-mark"><span class="ico"><i data-lucide="check"></i></span></span>Discrimina IVA</div>' +
      '</div>' +
      '<div style="margin-bottom:16px;"><div class="fld-label">Clasificación</div>' +
        '<input type="hidden" id="f-clasif" value="' + escapeHtml(ed ? curClas : '') + '">' +
        '<div class="fld-input" id="f-clasif-disp" style="background:var(--row-hover); color:var(--color-text-2); display:flex; align-items:center;">' +
          escapeHtml((ed && curClas) || 'Se asigna según el concepto') + '</div></div>' +
      fld('Observación', '<input id="f-obs" class="fld-input" placeholder="Detalle (opcional)" value="' + escapeHtml(ed ? (row['Observación'] || '') : '') + '">');

    openModal({
      title: ed ? 'Editar movimiento' : 'Nuevo movimiento',
      body: body,
      saveLabel: ed ? 'Guardar cambios' : 'Guardar movimiento',
      onSave: function (btn) { saveMov(btn, ed ? row._row : null); }
    });

    $('f-iva').addEventListener('click', function () { this.classList.toggle('is-on'); });
    function syncClasif() {
      var val = $('f-concepto').value;
      var g = ((state.lists && state.lists.glosario) || []).filter(function (x) { return x['Concepto'] === val; })[0];
      if (g && g['Clasificación']) {
        $('f-clasif').value = g['Clasificación'];
        $('f-clasif-disp').textContent = g['Clasificación'];
        $('f-iva').classList.toggle('is-on', ivaTrue(g['Aplica IVA']));
      } else {
        $('f-clasif').value = '';
        $('f-clasif-disp').textContent = 'Se asigna según el concepto';
      }
    }
    $('f-concepto').addEventListener('input', syncClasif);
    $('f-concepto').addEventListener('change', syncClasif);
  }

  function saveMov(btn, rowNum) {
    var fecha = $('f-fecha').value.trim();
    var concepto = $('f-concepto').value.trim();
    var monto = toNum($('f-monto').value);
    var clasif = $('f-clasif').value;
    var iva = $('f-iva').classList.contains('is-on');
    var ok = true;
    var fechaN = normalizeFecha(fecha);
    if (!fechaN) { fieldError('f-fecha', 'e-fecha', 'Fecha DD/MM o DD/MM/AAAA'); ok = false; } else fieldOk('f-fecha', 'e-fecha');
    if (!concepto) { fieldError('f-concepto', 'e-concepto', 'Ingresá un concepto'); ok = false; } else fieldOk('f-concepto', 'e-concepto');
    if (!(monto > 0)) { fieldError('f-monto', 'e-monto', 'Monto mayor a 0'); ok = false; } else fieldOk('f-monto', 'e-monto');
    if (!ok) return;

    var record = {
      'Fecha': fechaN, 'Lista/Concepto': concepto, 'Observación': $('f-obs').value.trim(),
      'Monto': monto, 'IVA': iva ? 'Sí' : 'No', 'Clasif': clasif
    };
    setBtnLoading(btn, true, rowNum ? 'Guardar cambios' : 'Guardar movimiento');
    var op = rowNum ? Api.update('MOVIMIENTOS', rowNum, record) : Api.create('MOVIMIENTOS', record);
    op.then(function () {
      closeModal();
      toast(rowNum ? 'Movimiento actualizado' : 'Movimiento guardado');
      loadMov(true);
    }).catch(function (err) { setBtnLoading(btn, false); toast(err.message, true); });
  }

  function deleteMov(rowNum) {
    if (!confirm('¿Eliminar este movimiento?')) return;
    showLoader(true);
    Api.remove('MOVIMIENTOS', rowNum).then(function () {
      showLoader(false); toast('Movimiento eliminado'); loadMov(true);
    }).catch(function (err) { showLoader(false); toast(err.message, true); });
  }

  /* ----------------------------- MP y Producción ----------------------------- */
  function insumosLista() { return ((state.lists && state.lists.insumos) || []); }
  function productosLista() { return ((state.lists && state.lists.productos) || []); }
  function prodCategorias() {
    var set = {};
    productosLista().forEach(function (p) { if (p['Categoría']) set[p['Categoría']] = 1; });
    ((state.mpprod.prod.rows) || []).forEach(function (r) { if (r['Categoría']) set[r['Categoría']] = 1; });
    var arr = Object.keys(set);
    return arr.length ? arr : ['Rellenas', 'Secas', 'Ñoquis'];
  }

  function ensureMpProd() {
    applyHeaderAction('mp');
    var t = state.mpprod.tab;
    if (t === 'mp' && state.mpprod.mp.rows == null) { loadingView(); return loadMpData(); }
    if (t === 'prod' && state.mpprod.prod.rows == null) { loadingView(); return loadProdData(); }
    // Stock por lote: Producción necesita las ventas para descontar lo vendido.
    if (t === 'prod' && state.ventas.rows == null) {
      Api.list('VENTAS').then(function (rows) { state.ventas.rows = rows; if (state.route === 'mp' && state.mpprod.tab === 'prod') renderMpProd(); }).catch(function () {});
    }
    // Recetas estampadas: para colorear la etiqueta completa y armar la Planilla de Producción.
    if (t === 'prod' && state.mpprod.recProd == null) {
      Api.list('RecetasProd').then(function (rows) { state.mpprod.recProd = rows; if (state.route === 'mp' && state.mpprod.tab === 'prod') renderMpProd(); }).catch(function () {});
    }
    renderMpProd();
  }

  // ----- Stock por lote (producción menos ventas de ese lote) -----
  function loteVendido(producto, lote) {
    return (state.ventas.rows || []).reduce(function (a, v) {
      return a + ((v['Producto'] === producto && v['Lote'] === lote) ? toNum(v['Cantidad']) : 0);
    }, 0);
  }
  function loteProducido(producto, lote) {
    return (state.mpprod.prod.rows || []).reduce(function (a, p) {
      var ob = String(p['OBS1'] || '').trim().toUpperCase();
      return a + ((p['Producto'] === producto && p['Lote'] === lote && ob !== 'SF' && ob !== 'SI') ? toNum(p['Unidades']) : 0);
    }, 0);
  }
  function loteStock(producto, lote) { return loteProducido(producto, lote) - loteVendido(producto, lote); }
  function lotesConStock(producto) {
    var seen = {}, out = [];
    (state.mpprod.prod.rows || []).forEach(function (p) {
      var ob = String(p['OBS1'] || '').trim().toUpperCase();
      if (p['Producto'] !== producto || !p['Lote'] || ob === 'SF' || ob === 'SI' || seen[p['Lote']]) return;
      seen[p['Lote']] = 1;
      var st = loteStock(producto, p['Lote']);
      if (st > 0) out.push({ lote: p['Lote'], stock: st, vto: p['Fecha Vto'] || '' });
    });
    return out;
  }
  function productosConStock() {
    var seen = {}, out = [];
    (state.mpprod.prod.rows || []).forEach(function (p) {
      var ob = String(p['OBS1'] || '').trim().toUpperCase();
      if (!p['Producto'] || ob === 'SF' || ob === 'SI' || seen[p['Producto']]) return;
      seen[p['Producto']] = 1;
      if (lotesConStock(p['Producto']).length) out.push(p['Producto']);
    });
    return out;
  }
  function loadMpData(silent) {
    if (!silent) showLoader(true);
    return Api.list('MP').then(function (rows) {
      state.mpprod.mp.rows = rows; showLoader(false);
      if (state.route === 'mp' && state.mpprod.tab === 'mp') renderMpProd();
    }).catch(function (err) { showLoader(false); toast(err.message, true); });
  }
  function loadProdData(silent) {
    if (!silent) showLoader(true);
    return Api.list('PROD').then(function (rows) {
      state.mpprod.prod.rows = rows; showLoader(false);
      if (state.route === 'mp' && state.mpprod.tab === 'prod') renderMpProd();
    }).catch(function (err) { showLoader(false); toast(err.message, true); });
  }
  function switchMpTab(t) {
    if (t !== state.mpprod.tab) { state.mpprod.mp.query = ''; state.mpprod.prod.query = ''; state.mpprod.stockQuery = ''; }
    state.mpprod.tab = t; applyHeaderAction('mp'); ensureMpProd();
  }

  function renderMpProd() {
    var isMp = state.mpprod.tab === 'mp';
    var tabs = '<div class="tabs-segmented" style="margin-bottom:20px;">' +
      '<button class="tab-seg' + (isMp ? ' is-active' : '') + '" data-tab="mp">Materia prima</button>' +
      '<button class="tab-seg' + (!isMp ? ' is-active' : '') + '" data-tab="prod">Producción</button></div>';
    var q = isMp ? state.mpprod.mp.query : state.mpprod.prod.query;
    var ph = isMp ? 'Buscar insumo…' : 'Buscar artículo o producto…';
    var poeBtn = isMp ? '<button class="btn btn-secondary" id="mp-poe" style="margin-left:auto;"><span class="ico"><i data-lucide="file-text"></i></span>POE</button>' : '';
    var pgpBtn = !isMp ? '<button class="btn btn-secondary" id="mp-pgp" style="margin-left:auto;"><span class="ico"><i data-lucide="file-text"></i></span>PGP</button>' : '';
    var planillaBtn = !isMp ? '<button class="btn btn-secondary" id="mp-planilla"><span class="ico"><i data-lucide="clipboard-list"></i></span>Planilla de Producción</button>' : '';
    var search = '<div class="filters" style="margin-bottom:16px;"><div class="search-box">' +
      '<span class="ico"><i data-lucide="search"></i></span>' +
      '<input id="mp-search" placeholder="' + ph + '" value="' + escapeHtml(q || '') + '"></div>' + poeBtn + pgpBtn + planillaBtn + '</div>';
    $('view').innerHTML = tabs + search + (isMp ? mpTableHtml() : (prodTableHtml() + stockMasterHtml()));

    Array.prototype.forEach.call($('view').querySelectorAll('[data-tab]'), function (el) {
      el.addEventListener('click', function () { switchMpTab(el.getAttribute('data-tab')); });
    });
    var poe = $('mp-poe'); if (poe) poe.onclick = pdfPOE;
    var pgp = $('mp-pgp'); if (pgp) pgp.onclick = pdfPGP;
    var pl = $('mp-planilla'); if (pl) pl.onclick = pdfPlanillaProd;
    var s = $('mp-search');
    if (s) s.addEventListener('input', function () {
      if (isMp) state.mpprod.mp.query = s.value; else state.mpprod.prod.query = s.value;
      renderMpProd();
      var ns = $('mp-search'); if (ns) { ns.focus(); ns.setSelectionRange(ns.value.length, ns.value.length); }
    });
    var ss = $('stock-search');
    if (ss) ss.addEventListener('input', function () {
      state.mpprod.stockQuery = ss.value;
      renderMpProd();
      var ns = $('stock-search'); if (ns) { ns.focus(); ns.setSelectionRange(ns.value.length, ns.value.length); }
    });
    wireRowActions(isMp ? 'mp' : 'prod');
    drawIcons();
  }

  // PDF imprimible de recepción de materias primas (POE), por categoría, del mes seleccionado.
  function pdfPOE() {
    var rows = (state.mpprod.mp.rows || []).filter(function (r) { return inPeriod(r['Fecha']); });
    var mesNom = MONTHS[state.period.mes - 1], anio = state.period.anio;
    var grupos = [
      { titulo: 'POE - Recepción de Materias Primas (SECOS)', prefix: 'MPS' },
      { titulo: 'POE - Recepción de Materias Primas (REFRIGERADOS)', prefix: 'MPR' },
      { titulo: 'POE - Recepción de Materias Primas (INSUMOS)', prefix: 'MPI' }
    ];
    var esc = escapeHtml;
    var sections = grupos.map(function (g) {
      var gr = rows.filter(function (r) { return String(r['ID insumo'] || '').indexOf(g.prefix + '-') === 0; })
        .sort(function (a, b) { return String(a['Fecha'] || '').localeCompare(String(b['Fecha'] || '')); });
      var body = gr.length
        ? gr.map(function (r) {
            return '<tr>' +
              '<td>' + esc(isoToShort(r['Fecha'])) + '</td>' +
              '<td>' + esc(r['Nombre'] || '') + '</td>' +
              '<td>' + esc(r['Proveedor'] || '') + '</td>' +
              '<td class="num">' + esc(String(r['Cantidad'] == null ? '' : r['Cantidad'])) + '</td>' +
              '<td>' + esc(r['Lote'] || '') + '</td>' +
              '<td>' + esc(r['Fecha Vto'] || '') + '</td>' +
              '<td></td></tr>';
          }).join('')
        : '<tr><td colspan="7" class="empty">Sin recepciones en el período.</td></tr>';
      return '<section class="poe"><h2>' + esc(g.titulo) + '</h2>' +
        '<table><thead><tr><th>Fecha</th><th>Producto</th><th>Proveedor</th><th class="num">Cantidad</th><th>Lote</th><th>Fecha Vto</th><th>Observaciones</th></tr></thead>' +
        '<tbody>' + body + '</tbody></table></section>';
    }).join('');

    var html =
      '<!DOCTYPE html><html lang="es"><head><meta charset="utf-8">' +
      '<title>POE Recepción MP · ' + esc(mesNom) + ' ' + anio + '</title>' +
      '<link href="https://fonts.googleapis.com/css2?family=Libre+Caslon+Display&family=Spectral:wght@400;500;600;700&family=Public+Sans:wght@400;500;600;700&display=swap" rel="stylesheet">' +
      '<style>' +
      '*{box-sizing:border-box;} body{font-family:"Public Sans",sans-serif;color:#211E1C;background:#fff;margin:0;padding:26px 24px 64px;}' +
      '.doc-head{border-bottom:3px solid #C8102E;padding-bottom:10px;margin-bottom:18px;}' +
      '.doc-head .brand{font-family:"Libre Caslon Display",serif;font-size:23px;color:#1C1A19;}' +
      '.doc-head .brand b{color:#C8102E;font-weight:400;}' +
      '.doc-head .sub{font-size:12px;color:#6B655E;margin-top:3px;}' +
      'section.poe{margin-bottom:22px;page-break-inside:avoid;}' +
      'section.poe h2{font-family:"Spectral",serif;font-size:13.5px;color:#fff;background:#1C1A19;padding:8px 12px;border-left:5px solid #E8B84B;margin:0;}' +
      'table{width:100%;border-collapse:collapse;font-size:11px;}' +
      'thead th{background:#F6F0E6;color:#1C1A19;text-align:left;padding:7px 8px;border:1px solid #E2D9C7;font-weight:600;}' +
      'tbody td{padding:6px 8px;border:1px solid #E2D9C7;vertical-align:top;}' +
      'th.num,td.num{text-align:right;font-variant-numeric:tabular-nums;}' +
      'td.empty{text-align:center;color:#A89F8C;font-style:italic;}' +
      '.poe-foot{position:fixed;bottom:0;left:0;right:0;height:46px;border-top:1px solid #E2D9C7;padding:0 24px;font-size:10.5px;color:#6B655E;display:flex;justify-content:space-between;align-items:center;background:#fff;}' +
      '.poe-foot .gold{color:#B98A1E;font-weight:600;}' +
      '.toolbar{display:flex;gap:8px;justify-content:flex-end;margin-bottom:14px;}' +
      '.toolbar button{font-family:inherit;font-size:13px;font-weight:600;border:none;border-radius:8px;padding:9px 16px;background:#C8102E;color:#fff;cursor:pointer;}' +
      '@page{size:A4;margin:14mm 10mm 18mm;}' +
      '@media print{.noprint{display:none;}body{padding-top:6px;}}' +
      '</style></head><body>' +
      '<div class="noprint toolbar"><button onclick="window.print()">Imprimir / Guardar PDF</button></div>' +
      '<div class="doc-head"><div class="brand">Génova <b>Sin TACC</b></div>' +
      '<div class="sub">Recepción de Materias Primas · ' + esc(mesNom) + ' ' + anio + '</div></div>' +
      sections +
      '<div class="poe-foot"><span>Génova Sin TACC</span><span class="gold">' + esc(mesNom) + ' ' + anio + '</span></div>' +
      '<script>window.addEventListener("load",function(){setTimeout(function(){window.print();},500);});<\/script>' +
      '</body></html>';

    var w = window.open('', '_blank');
    if (!w) { toast('Permití las ventanas emergentes para generar el PDF', true); return; }
    w.document.open(); w.document.write(html); w.document.close();
  }

  // Documento imprimible con diseño de marca (encabezado + secciones + pie). Usado por PGP.
  function openPrintDoc(winTitle, headerSub, sectionsHtml, landscape) {
    var esc = escapeHtml;
    var mesNom = MONTHS[state.period.mes - 1], anio = state.period.anio;
    var html =
      '<!DOCTYPE html><html lang="es"><head><meta charset="utf-8">' +
      '<title>' + esc(winTitle) + '</title>' +
      '<link href="https://fonts.googleapis.com/css2?family=Libre+Caslon+Display&family=Spectral:wght@400;500;600;700&family=Public+Sans:wght@400;500;600;700&display=swap" rel="stylesheet">' +
      '<style>' +
      '*{box-sizing:border-box;} body{font-family:"Public Sans",sans-serif;color:#211E1C;background:#fff;margin:0;padding:26px 24px 64px;}' +
      '.doc-head{border-bottom:3px solid #C8102E;padding-bottom:10px;margin-bottom:18px;}' +
      '.doc-head .brand{font-family:"Libre Caslon Display",serif;font-size:23px;color:#1C1A19;}' +
      '.doc-head .brand b{color:#C8102E;font-weight:400;}' +
      '.doc-head .sub{font-size:12px;color:#6B655E;margin-top:3px;}' +
      'section.poe{margin-bottom:22px;page-break-inside:avoid;}' +
      'section.poe h2{font-family:"Spectral",serif;font-size:13.5px;color:#fff;background:#1C1A19;padding:8px 12px;border-left:5px solid #E8B84B;margin:0;}' +
      'table{width:100%;border-collapse:collapse;font-size:11px;}' +
      'thead th{background:#F6F0E6;color:#1C1A19;text-align:left;padding:7px 8px;border:1px solid #E2D9C7;font-weight:600;}' +
      'tbody td{padding:6px 8px;border:1px solid #E2D9C7;vertical-align:top;}' +
      'th.num,td.num{text-align:right;font-variant-numeric:tabular-nums;}' +
      'td.empty{text-align:center;color:#A89F8C;font-style:italic;}' +
      '.poe-foot{position:fixed;bottom:0;left:0;right:0;height:46px;border-top:1px solid #E2D9C7;padding:0 24px;font-size:10.5px;color:#6B655E;display:flex;justify-content:space-between;align-items:center;background:#fff;}' +
      '.poe-foot .gold{color:#B98A1E;font-weight:600;}' +
      '.toolbar{display:flex;gap:8px;justify-content:flex-end;margin-bottom:14px;}' +
      '.toolbar button{font-family:inherit;font-size:13px;font-weight:600;border:none;border-radius:8px;padding:9px 16px;background:#C8102E;color:#fff;cursor:pointer;}' +
      '.etq-block{margin-bottom:30px;page-break-inside:avoid;}' +
      '.etq-hd{display:flex;justify-content:space-between;align-items:baseline;gap:12px;background:#1C1A19;color:#fff;border-left:5px solid #E8B84B;padding:8px 12px;}' +
      '.etq-hd .etq-title{font-family:"Spectral",serif;font-weight:600;font-size:13px;}' +
      '.etq-hd .etq-meta{font-size:10.5px;color:#E7D9BE;white-space:nowrap;}' +
      'table.etq{width:100%;border-collapse:collapse;}' +
      'table.etq th{background:#F6F0E6;color:#1C1A19;text-align:left;padding:6px 8px;border:1px solid #E2D9C7;font-weight:600;font-size:10.5px;}' +
      'table.etq td{padding:6px 8px;border:1px solid #E2D9C7;font-size:10.5px;}' +
      'table.etq th.num,table.etq td.num{text-align:right;font-variant-numeric:tabular-nums;}' +
      '.etq-ft{width:64%;margin-left:auto;display:flex;justify-content:space-between;gap:16px;background:#FBF6EC;border:1px solid #C8102E;border-top:none;padding:7px 14px;font-size:10.5px;color:#1C1A19;border-radius:0 0 7px 7px;}' +
      '.etq-ft b{color:#8F0F22;}' +
      '@page{size:A4' + (landscape ? ' landscape' : '') + ';margin:14mm 10mm 18mm;}' +
      '@media print{.noprint{display:none;}body{padding-top:6px;}}' +
      '</style></head><body>' +
      '<div class="noprint toolbar"><button onclick="window.print()">Imprimir / Guardar PDF</button></div>' +
      '<div class="doc-head"><div class="brand">Génova <b>Sin TACC</b></div>' +
      '<div class="sub">' + esc(headerSub) + '</div></div>' +
      sectionsHtml +
      '<div class="poe-foot"><span>Génova Sin TACC</span><span class="gold">' + esc(mesNom) + ' ' + anio + '</span></div>' +
      '<script>window.addEventListener("load",function(){setTimeout(function(){window.print();},500);});<\/script>' +
      '</body></html>';
    var w = window.open('', '_blank');
    if (!w) { toast('Permití las ventanas emergentes para generar el PDF', true); return; }
    w.document.open(); w.document.write(html); w.document.close();
  }

  // PDF: Planilla General de Productos (producción del mes seleccionado).
  function pdfPGP() {
    var esc = escapeHtml;
    var mesNom = MONTHS[state.period.mes - 1], anio = state.period.anio;
    var rows = (state.mpprod.prod.rows || []).filter(function (r) {
      var ob = String(r['OBS1'] || '').trim().toUpperCase();
      return inPeriod(r['Fecha']) && ob !== 'SF' && ob !== 'SI';
    }).sort(function (a, b) { return String(a['Fecha'] || '').localeCompare(String(b['Fecha'] || '')); });
    function kgEnv(prod) { var m = productosLista().filter(function (p) { return p['Producto'] === prod; })[0]; return m ? toNum(m['Kg por envase']) : 0; }
    var body = rows.length
      ? rows.map(function (r) {
          var env = toNum(r['Unidades']);
          var kg = env * kgEnv(r['Producto']);
          return '<tr>' +
            '<td>' + esc(isoToShort(r['Fecha'])) + '</td>' +
            '<td>' + esc(((r['Artículo'] ? r['Artículo'] + ' ' : '') + (r['Producto'] || '')).trim()) + '</td>' +
            '<td class="num">' + (kg ? kg.toLocaleString('es-AR', { maximumFractionDigits: 2 }) : '') + '</td>' +
            '<td class="num">' + esc(env ? String(env) : '') + '</td>' +
            '<td>' + esc(r['Lote'] || '') + '</td>' +
            '<td></td></tr>';
        }).join('')
      : '<tr><td colspan="6" class="empty">Sin producción en el período.</td></tr>';
    var section = '<section class="poe"><h2>Planilla General de Productos</h2>' +
      '<table><thead><tr><th>Fecha</th><th>Producto</th><th class="num">Kg totales</th><th class="num">Envases</th><th>Lote</th><th>Observaciones</th></tr></thead>' +
      '<tbody>' + body + '</tbody></table></section>';
    openPrintDoc('PGP · ' + mesNom + ' ' + anio, 'Planilla General de Productos · ' + mesNom + ' ' + anio, section);
  }

  // PDF: Planilla de Producción (horizontal). Etiquetas completas del período, orden ascendente por fecha.
  function pdfPlanillaProd() {
    if (state.mpprod.recProd == null || state.mpprod.mp.rows == null) {
      showLoader(true);
      var need = [
        state.mpprod.recProd == null ? Api.list('RecetasProd').then(function (r) { state.mpprod.recProd = r; }) : Promise.resolve(),
        state.mpprod.mp.rows == null ? Api.list('MP').then(function (r) { state.mpprod.mp.rows = r; }) : Promise.resolve()
      ];
      Promise.all(need).then(function () { showLoader(false); pdfPlanillaProd(); })
        .catch(function (err) { showLoader(false); toast(err.message, true); });
      return;
    }
    var esc = escapeHtml;
    var mesNom = MONTHS[state.period.mes - 1], anio = state.period.anio;
    function kgEnv(prod) { var m = productosLista().filter(function (p) { return p['Producto'] === prod; })[0]; return m ? toNum(m['Kg por envase']) : 0; }
    // Lote / Proveedor / Fecha Vto se toman en vivo del insumo (recepción de MP) elegido en la etiqueta.
    var mpByRef = {};
    (state.mpprod.mp.rows || []).forEach(function (m) { mpByRef[String(m['reqId'] || m._row)] = m; });
    var rows = (state.mpprod.prod.rows || []).filter(function (r) {
      var ob = String(r['OBS1'] || '').trim().toUpperCase();
      return inPeriod(r['Fecha']) && ob !== 'SF' && ob !== 'SI' && consumoCompleto(r);
    }).sort(function (a, b) { return String(a['Fecha'] || '').localeCompare(String(b['Fecha'] || '')); });
    if (!rows.length) { toast('No hay etiquetas de receta completas en el período', true); return; }

    var etiquetas = rows.map(function (r) {
      var nombreProd = ((r['Artículo'] ? r['Artículo'] + ' ' : '') + (r['Producto'] || '')).trim();
      var env = toNum(r['Unidades']);
      var kgTot = env * kgEnv(r['Producto']);
      var ings = recProdIngs(recProdFor(r));
      var filas = ings.map(function (g) {
        var mp = mpByRef[g.mpRef] || null;
        var lote = mp ? (mp['Lote'] || '') : (g.lote || '');
        var vto = mp ? (mp['Fecha Vto'] || '') : (g.vto || '');
        var prov = mp ? (mp['Proveedor'] || '') : (g.proveedor || '');
        return '<tr>' +
          '<td>' + esc(g.nombre || g.insumo || '') + '</td>' +
          '<td class="num">' + (g.valor != null && g.valor !== '' ? esc(num(g.valor)) + ' g' : '') + '</td>' +
          '<td>' + esc(lote) + '</td>' +
          '<td>' + esc(vto) + '</td>' +
          '<td>' + esc(prov) + '</td>' +
          '<td></td></tr>';
      }).join('');
      return '<div class="etq-block">' +
        '<div class="etq-hd"><span class="etq-title">' + esc(nombreProd) + '</span>' +
          '<span class="etq-meta"><b>' + esc(fechaDiaNombre(r['Fecha'])) + '</b> · Operario: Daniela Peragallo</span></div>' +
        '<table class="etq"><thead><tr>' +
          '<th>MP</th><th class="num">Consumo</th><th>Lote</th><th>Fecha Vto</th><th>Proveedor</th><th>Observaciones</th>' +
          '</tr></thead><tbody>' + filas + '</tbody></table>' +
        '<div class="etq-ft">' +
          '<span>Total de producto: <b>' + (kgTot ? kgTot.toLocaleString('es-AR', { maximumFractionDigits: 2 }) : '0') + ' kg</b></span>' +
          '<span>Lote: <b>' + esc(r['Lote'] || '—') + '</b></span>' +
          '<span>Total de envases: <b>' + esc(String(env || 0)) + '</b></span>' +
        '</div></div>';
    }).join('');

    var section = '<section class="poe"><h2>Planilla de Producción</h2></section>' + etiquetas;
    openPrintDoc('Planilla de Producción · ' + mesNom + ' ' + anio, 'Planilla de Producción · ' + mesNom + ' ' + anio, section, true);
  }

  // PDF: Salida (ventas del mes). Toma Artículo+Producto, Kg total, envases, lote, vto y destino.
  function pdfSalida() {
    // Necesitamos producción cargada para el Fecha Vto del lote.
    if (state.mpprod.prod.rows == null) {
      showLoader(true);
      Api.list('PROD').then(function (rows) { state.mpprod.prod.rows = rows; showLoader(false); pdfSalida(); })
        .catch(function (e) { showLoader(false); toast(e.message, true); });
      return;
    }
    var esc = escapeHtml;
    var mesNom = MONTHS[state.period.mes - 1], anio = state.period.anio;
    var rows = (state.ventas.rows || []).filter(function (r) { return inPeriod(r['Fecha']) && r['Producto']; })
      .sort(function (a, b) { return String(a['Fecha'] || '').localeCompare(String(b['Fecha'] || '')); });
    function prodInfo(p) { return productosLista().filter(function (x) { return x['Producto'] === p; })[0] || {}; }
    function vtoLote(prod, lote) {
      var m = (state.mpprod.prod.rows || []).filter(function (r) { return r['Producto'] === prod && r['Lote'] === lote; })[0];
      return m ? (m['Fecha Vto'] || '') : '';
    }
    var body = rows.length
      ? rows.map(function (r) {
          var pi = prodInfo(r['Producto']);
          var env = toNum(r['Cantidad']);
          var kg = env * toNum(pi['Kg por envase']);
          var prodLbl = ((pi['Artículo'] ? pi['Artículo'] + ' ' : '') + (r['Producto'] || '')).trim();
          return '<tr>' +
            '<td>' + esc(isoToShort(r['Fecha'])) + '</td>' +
            '<td>' + esc(prodLbl) + '</td>' +
            '<td class="num">' + (kg ? kg.toLocaleString('es-AR', { maximumFractionDigits: 2 }) : '') + '</td>' +
            '<td class="num">' + esc(env ? String(env) : '') + '</td>' +
            '<td>' + esc(r['Lote'] || '') + '</td>' +
            '<td>' + esc(vtoLote(r['Producto'], r['Lote'])) + '</td>' +
            '<td>' + esc(r['Lista/Canal'] || '') + '</td>' +
            '<td></td></tr>';
        }).join('')
      : '<tr><td colspan="8" class="empty">Sin ventas en el período.</td></tr>';
    var section = '<section class="poe"><h2>Salida de Productos</h2>' +
      '<table><thead><tr><th>Fecha</th><th>Producto</th><th class="num">Kg en total</th><th class="num">Envases</th><th>Lote</th><th>Fecha Vto</th><th>Destino</th><th>Observaciones</th></tr></thead>' +
      '<tbody>' + body + '</tbody></table></section>';
    openPrintDoc('Salida · ' + mesNom + ' ' + anio, 'Salida de Productos · ' + mesNom + ' ' + anio, section);
  }

  function mpTableHtml() {
    var q = (state.mpprod.mp.query || '').trim().toLowerCase();
    var rows = (state.mpprod.mp.rows || []).filter(function (r) {
      return inPeriod(r['Fecha']) && (q === '' || String(r['Nombre'] || '').toLowerCase().indexOf(q) >= 0);
    }).sort(function (a, b) { return String(a['Fecha'] || '').localeCompare(String(b['Fecha'] || '')); });
    if (rows.length === 0) return emptyHtml('package', 'Sin compras este mes', 'No hay compras para este filtro.');
    var head = '<div class="dt-head"><div>Fecha</div><div>Insumo</div><div class="r-right">Cantidad</div>' +
      '<div class="r-right">Precio unit.</div><div class="r-right">Total</div><div></div></div>';
    var trs = rows.map(function (r) {
      return '<div class="dt-row">' +
        '<div class="date">' + isoToShort(r['Fecha']) + '</div>' +
        '<div>' +
          '<div style="font-weight:500;"><span class="mono" style="color:var(--color-accent-700);">' + escapeHtml(r['ID insumo'] || '—') + '</span> ' + escapeHtml(r['Nombre'] || '') + '</div>' +
          (([r['Proveedor'], r['Lote'] && ('Lote ' + r['Lote'])].filter(Boolean).join(' · '))
            ? '<div class="muted" style="font-size:11.5px;">' + escapeHtml([r['Proveedor'], r['Lote'] && ('Lote ' + r['Lote'])].filter(Boolean).join(' · ')) + '</div>' : '') +
        '</div>' +
        '<div class="num muted">' + escapeHtml(String(r['Cantidad'] == null ? '' : r['Cantidad'])) + '</div>' +
        '<div class="num muted">' + money(r['Precio unitario']) + '</div>' +
        '<div class="num strong">' + money(r['Total']) + '</div>' +
        rowActionsHtml(r._row) + '</div>';
    }).join('');
    var total = rows.reduce(function (a, r) { return a + toNum(r['Total']); }, 0);
    var cantTot = rows.reduce(function (a, r) { return a + toNum(r['Cantidad']); }, 0);
    var pond = (q !== '' && cantTot > 0)
      ? '<div>Precio prom. ponderado <span class="num strong" style="padding:0; margin-left:6px;">' + money(total / cantTot) + '</span></div>'
      : '';
    var foot = '<div class="dt-foot"><div>' + rows.length + ' compras</div>' + pond +
      '<div>Total <span class="num strong" style="padding:0; margin-left:6px;">' + money(total) + '</span></div></div>';
    return '<div class="data-table tbl-mp">' + head + trs + foot + '</div>';
  }

  function prodTableHtml() {
    var q = (state.mpprod.prod.query || '').trim().toLowerCase();
    var rows = (state.mpprod.prod.rows || []).filter(function (r) {
      var ob = String(r['OBS1'] || '').trim().toUpperCase();
      return inPeriod(r['Fecha']) && ob !== 'SF' && ob !== 'SI' && (q === '' ||
        String(r['Artículo'] || '').toLowerCase().indexOf(q) >= 0 ||
        String(r['Producto'] || '').toLowerCase().indexOf(q) >= 0);
    }).sort(function (a, b) { return String(a['Fecha'] || '').localeCompare(String(b['Fecha'] || '')); });
    if (rows.length === 0) return emptyHtml('utensils', 'Sin producción este mes', 'No hay producción para este filtro.');
    var head = '<div class="dt-head"><div>Fecha</div><div>Categoría</div><div>Artículo</div><div>Producto</div>' +
      '<div class="r-right">Unidades producidas</div><div>OBS</div><div class="r-center">Receta</div><div class="r-right">Descuento</div><div></div></div>';
    var trs = rows.map(function (r) {
      return '<div class="dt-row">' +
        '<div class="date" style="font-size:12px;">' + isoToShort(r['Fecha']) + '</div>' +
        '<div class="muted">' + escapeHtml(r['Categoría'] || '—') + '</div>' +
        '<div style="font-weight:500;">' + escapeHtml(r['Artículo'] || '') + '</div>' +
        '<div>' + escapeHtml(r['Producto'] || '') +
          (([r['Lote'] && ('Lote ' + r['Lote']), r['Fecha Vto'] && ('Vto ' + r['Fecha Vto'])].filter(Boolean).join(' · '))
            ? '<div class="muted" style="font-size:11px;">' + escapeHtml([r['Lote'] && ('Lote ' + r['Lote']), r['Fecha Vto'] && ('Vto ' + r['Fecha Vto'])].filter(Boolean).join(' · ')) + '</div>' : '') +
        '</div>' +
        '<div class="num strong">' + num(r['Unidades']) + '</div>' +
        '<div class="text-3" style="font-size:12px;">' + escapeHtml(r['OBS1'] || '—') + '</div>' +
        '<div class="r-center"><span class="tag-consumo' + (consumoCompleto(r) ? ' is-complete' : '') + '" data-consumo="' + r._row + '">Receta</span></div>' +
        '<div class="num muted">' + escapeHtml(String(r['Descuento'] == null ? '' : r['Descuento'])) + '</div>' +
        rowActionsHtml(r._row) + '</div>';
    }).join('');
    var totalU = rows.reduce(function (a, r) { return a + toNum(r['Unidades']); }, 0);
    var foot = '<div class="dt-foot"><div>' + rows.length + ' registros</div>' +
      '<div>Unidades producidas <span class="num strong" style="padding:0; margin-left:6px;">' + num(totalU) + '</span></div></div>';
    return '<div class="data-table tbl-prod">' + head + trs + foot + '</div>';
  }

  // Lista maestra de stock: productos con stock por lote, independiente del mes.
  function stockMasterHtml() {
    var seen = {}, items = [];
    (state.mpprod.prod.rows || []).forEach(function (p) {
      var ob = String(p['OBS1'] || '').trim().toUpperCase();
      if (!p['Producto'] || !p['Lote'] || ob === 'SF' || ob === 'SI') return;
      var key = p['Producto'] + '|' + p['Lote']; if (seen[key]) return; seen[key] = 1;
      var st = loteStock(p['Producto'], p['Lote']);
      if (st > 0) items.push({ producto: p['Producto'], articulo: p['Artículo'] || '', lote: p['Lote'], vto: p['Fecha Vto'] || '', stock: st });
    });
    items.sort(function (a, b) { return (a.producto + a.lote).localeCompare(b.producto + b.lote); });
    var sq = (state.mpprod.stockQuery || '').trim().toLowerCase();
    if (sq) items = items.filter(function (it) {
      return ((it.articulo + ' ' + it.producto + ' ' + it.lote).toLowerCase()).indexOf(sq) >= 0;
    });
    var sBox = '<div class="filters" style="margin-bottom:14px;"><div class="search-box">' +
      '<span class="ico"><i data-lucide="search"></i></span>' +
      '<input id="stock-search" placeholder="Buscar producto o lote…" value="' + escapeHtml(state.mpprod.stockQuery || '') + '"></div></div>';
    var inner;
    if (!items.length) {
      inner = emptyHtml('package', 'Sin stock', 'No hay productos con stock disponible.');
    } else {
      var head = '<div class="dt-head"><div>Producto</div><div>Lote</div><div>Fecha Vto</div><div class="r-right">Stock</div></div>';
      var trs = items.map(function (it) {
        return '<div class="dt-row">' +
          '<div style="font-weight:500;">' + escapeHtml(((it.articulo ? it.articulo + ' ' : '') + it.producto).trim()) + '</div>' +
          '<div class="mono" style="font-size:12.5px;">' + escapeHtml(it.lote) + '</div>' +
          '<div class="muted">' + escapeHtml(it.vto || '—') + '</div>' +
          '<div class="num strong" style="color:var(--color-accent-700);">' + num(it.stock) + '</div></div>';
      }).join('');
      var totalStock = items.reduce(function (a, it) { return a + it.stock; }, 0);
      var foot = '<div class="dt-foot"><div>' + items.length + ' lotes con stock</div>' +
        '<div>Stock total <span class="num strong" style="padding:0; margin-left:6px; color:var(--color-accent-700);">' + num(totalStock) + '</span></div></div>';
      inner = '<div class="data-table tbl-stock">' + head + trs + foot + '</div>';
    }
    return '<div style="margin-top:26px;"><div class="cfg-title">Stock disponible</div>' +
      '<div class="cfg-sub" style="margin-bottom:14px;">Productos con stock de producción (fijo, sin importar el mes).</div>' + sBox + inner + '</div>';
  }

  function mesNombre(m) { var n = Number(m); return (n >= 1 && n <= 12) ? MONTHS_SHORT[n - 1] : (m == null ? '' : String(m)); }
  function emptyHtml(icon, title, sub) {
    return '<div class="empty-state"><div class="empty-ico"><span class="ico"><i data-lucide="' + icon + '"></i></span></div>' +
      '<div class="empty-title">' + title + '</div><div class="empty-sub">' + sub + '</div></div>';
  }
  function rowActionsHtml(rowNum) {
    return '<div class="row-actions">' +
      '<span class="icon-btn" data-edit="' + rowNum + '"><span class="ico"><i data-lucide="pencil"></i></span></span>' +
      '<span class="icon-btn danger" data-del="' + rowNum + '"><span class="ico"><i data-lucide="trash-2"></i></span></span></div>';
  }
  function prodRowActionsHtml(rowNum) {
    return '<div class="row-actions">' +
      '<span class="icon-btn" data-receta="' + rowNum + '" title="Receta"><span class="ico"><i data-lucide="notebook-pen"></i></span></span>' +
      '<span class="icon-btn" data-edit="' + rowNum + '"><span class="ico"><i data-lucide="pencil"></i></span></span>' +
      '<span class="icon-btn danger" data-del="' + rowNum + '"><span class="ico"><i data-lucide="trash-2"></i></span></span></div>';
  }
  function wireRowActions(kind) {
    var v = $('view');
    Array.prototype.forEach.call(v.querySelectorAll('[data-edit]'), function (el) {
      el.addEventListener('click', function () {
        var n = Number(el.getAttribute('data-edit'));
        var arr = kind === 'mp' ? state.mpprod.mp.rows : state.mpprod.prod.rows;
        var row = (arr || []).filter(function (r) { return r._row === n; })[0] || null;
        if (kind === 'mp') openCompraModal(row); else openProdModal(row);
      });
    });
    Array.prototype.forEach.call(v.querySelectorAll('[data-del]'), function (el) {
      el.addEventListener('click', function () { deleteMpProd(kind, Number(el.getAttribute('data-del'))); });
    });
    Array.prototype.forEach.call(v.querySelectorAll('[data-consumo]'), function (el) {
      el.addEventListener('click', function () {
        var n = Number(el.getAttribute('data-consumo'));
        var row = (state.mpprod.prod.rows || []).filter(function (r) { return r._row === n; })[0] || null;
        if (row) openConsumoModal(row);
      });
    });
  }

  function openCompraModal(row) {
    var ed = !!row;
    var insumos = insumosLista().map(function (i) { return i['Nombre']; }).filter(Boolean);
    var datalist = '<datalist id="dl-insumos">' + insumos.map(function (n) { return '<option value="' + escapeHtml(n) + '">'; }).join('') + '</datalist>';
    var body =
      '<div class="form-grid g-2">' +
        fld('Fecha', '<input id="f-fecha" class="fld-input" placeholder="14/03 o 14/03/2026" value="' + escapeHtml(ed ? isoToInput(row['Fecha']) : '') + '"><div class="fld-err" id="e-fecha"></div>') +
        fld('Insumo', '<input id="f-insumo" class="fld-input" list="dl-insumos" placeholder="Nombre del insumo" value="' + escapeHtml(ed ? (row['Nombre'] || '') : '') + '">' + datalist + '<div class="fld-err" id="e-insumo"></div>') +
      '</div>' +
      '<div class="form-grid g-3" style="margin-bottom:0;">' +
        fld('Cantidad', '<input id="f-cant" class="fld-input" placeholder="200 kg" value="' + escapeHtml(ed ? (row['Cantidad'] || '') : '') + '">') +
        fld('Precio unit.', moneyInput('f-precio', row && row['Precio unitario']) + '<div class="fld-err" id="e-precio"></div>') +
        fld('Total', '<input id="f-total" class="fld-input mono" placeholder="0" value="' + (ed ? escapeHtml(String(row['Total'] || '')) : '') + '" readonly>') +
      '</div>' +
      '<div class="form-grid g-2" style="margin-top:14px;">' +
        fld('Proveedor', '<input id="f-prov" class="fld-input" placeholder="Proveedor" value="' + escapeHtml(ed ? (row['Proveedor'] || '') : '') + '">') +
        fld('Lote', '<input id="f-lote" class="fld-input" placeholder="N° de lote" value="' + escapeHtml(ed ? (row['Lote'] || '') : '') + '">') +
      '</div>' +
      '<div class="form-grid g-2">' +
        fld('Bulto cerrado', '<input id="f-bulto" class="fld-input" placeholder="Ej: caja x10" value="' + escapeHtml(ed ? (row['Bulto cerrado'] || '') : '') + '">') +
        fld('Fecha Vto', '<input id="f-vto" class="fld-input" placeholder="DD/MM/AAAA" value="' + escapeHtml(ed ? (row['Fecha Vto'] || '') : '') + '">') +
      '</div>';
    openModal({
      title: ed ? 'Editar compra' : 'Nueva compra',
      body: body,
      saveLabel: ed ? 'Guardar cambios' : 'Guardar compra',
      onSave: function (btn) { saveCompra(btn, ed ? row._row : null); }
    });
    var recalc = function () { $('f-total').value = num(toNum($('f-cant').value) * toNum($('f-precio').value)); };
    $('f-cant').addEventListener('input', recalc);
    $('f-precio').addEventListener('input', recalc);
  }

  function saveCompra(btn, rowNum) {
    var fecha = $('f-fecha').value.trim(), insumo = $('f-insumo').value.trim();
    var precio = toNum($('f-precio').value);
    var ok = true;
    var fechaN = normalizeFecha(fecha);
    if (!fechaN) { fieldError('f-fecha', 'e-fecha', 'Fecha DD/MM o DD/MM/AAAA'); ok = false; } else fieldOk('f-fecha', 'e-fecha');
    if (!insumo) { fieldError('f-insumo', 'e-insumo', 'Ingresá el insumo'); ok = false; } else fieldOk('f-insumo', 'e-insumo');
    if (!(precio > 0)) { fieldError('f-precio', 'e-precio', 'Precio mayor a 0'); ok = false; } else fieldOk('f-precio', 'e-precio');
    if (!ok) return;
    var match = insumosLista().filter(function (i) { return i['Nombre'] === insumo; })[0];
    var cantNum = toNum($('f-cant').value);
    var record = {
      'Fecha': fechaN, 'ID insumo': match ? (match['Código'] || '') : '', 'Nombre': insumo,
      'Cantidad': $('f-cant').value.trim(), 'Precio unitario': precio,
      'Proveedor': $('f-prov').value.trim(), 'Bulto cerrado': $('f-bulto').value.trim(),
      'Lote': $('f-lote').value.trim(), 'Fecha Vto': $('f-vto').value.trim()
    };
    // Insumo marcado "es también producto": al comprarlo se replica en Producción (solo cantidad).
    var esProd = !rowNum && match && ivaTrue(match['Es producto']);
    setBtnLoading(btn, true, rowNum ? 'Guardar cambios' : 'Guardar compra');
    var op = rowNum ? Api.update('MP', rowNum, record) : Api.create('MP', record);
    op.then(function () {
      if (esProd) return Api.create('PROD', {
        'Fecha': fechaN, 'Categoría': match['Categoría'] || '', 'Artículo': 'compras',
        'Producto': insumo, 'Unidades': cantNum, 'OBS1': '', 'Descuento': ''
      });
    }).then(function () {
      closeModal();
      toast(rowNum ? 'Compra actualizada' : (esProd ? 'Compra y producción registradas' : 'Compra registrada'));
      loadMpData(true);
      if (esProd) loadProdData(true);
    }).catch(function (err) { setBtnLoading(btn, false); toast(err.message, true); });
  }

  function openProdModal(row) {
    var ed = !!row;
    var prods = {};
    productosLista().forEach(function (p) { if (p['Producto']) prods[p['Producto']] = 1; });
    var dlP = '<datalist id="dl-prod">' + Object.keys(prods).map(function (n) { return '<option value="' + escapeHtml(n) + '">'; }).join('') + '</datalist>';
    var body =
      '<div class="form-grid g-2">' +
        fld('Fecha', '<input id="f-fecha" class="fld-input" placeholder="14/03 o 14/03/2026" value="' + escapeHtml(ed ? isoToInput(row['Fecha']) : '') + '"><div class="fld-err" id="e-fecha"></div>') +
        fld('Producto', '<input id="f-producto" class="fld-input" list="dl-prod" placeholder="Ravioles ricota y verdura" value="' + escapeHtml(ed ? (row['Producto'] || '') : '') + '">' + dlP + '<div class="fld-err" id="e-producto"></div>') +
      '</div>' +
      '<div class="form-grid g-3" style="margin-bottom:16px;">' +
        fld('Unidades', moneyInput('f-uds', row && row['Unidades']) + '<div class="fld-err" id="e-uds"></div>') +
        fld('Descuento', '<input id="f-desc" class="fld-input mono" placeholder="0%" value="' + escapeHtml(ed ? (row['Descuento'] || '') : '') + '">') +
        fld('Fecha Vto', '<input id="f-pvto" class="fld-input" placeholder="DD/MM/AAAA" value="' + escapeHtml(ed ? (row['Fecha Vto'] || '') : '') + '">') +
      '</div>' +
      fld('Observación', '<input id="f-obs" class="fld-input" placeholder="Detalle (opcional)" value="' + escapeHtml(ed ? (row['OBS1'] || '') : '') + '">');
    openModal({
      title: ed ? 'Editar producción' : 'Registrar producción',
      body: body,
      saveLabel: ed ? 'Guardar cambios' : 'Guardar producción',
      onSave: function (btn) { saveProd(btn, ed ? row._row : null); }
    });
  }

  function saveProd(btn, rowNum) {
    var fecha = $('f-fecha').value.trim();
    var producto = $('f-producto').value.trim();
    var uds = toNum($('f-uds').value);
    var ok = true;
    var fechaN = normalizeFecha(fecha);
    if (!fechaN) { fieldError('f-fecha', 'e-fecha', 'Fecha DD/MM o DD/MM/AAAA'); ok = false; } else fieldOk('f-fecha', 'e-fecha');
    if (!producto) { fieldError('f-producto', 'e-producto', 'Ingresá el producto'); ok = false; } else fieldOk('f-producto', 'e-producto');
    if (!(uds > 0)) { fieldError('f-uds', 'e-uds', 'Unidades mayor a 0'); ok = false; } else fieldOk('f-uds', 'e-uds');
    if (!ok) return;
    var match = productosLista().filter(function (p) { return p['Producto'] === producto; })[0];
    var articulo = match ? (match['Artículo'] || producto) : producto;
    var categoria = match ? (match['Categoría'] || '') : '';
    var modelo = match ? (match['Modelo de loteo'] || '') : '';
    var lote = (modelo ? modelo + '-' : '') + fechaN.replace(/\//g, ''); // ej FC-14032026
    var record = {
      'Fecha': fechaN, 'Categoría': categoria, 'Artículo': articulo, 'Producto': producto,
      'Unidades': uds, 'OBS1': $('f-obs').value.trim(), 'Descuento': $('f-desc').value.trim(),
      'Lote': lote, 'Fecha Vto': $('f-pvto').value.trim()
    };
    setBtnLoading(btn, true, rowNum ? 'Guardar cambios' : 'Guardar producción');
    var op = rowNum ? Api.update('PROD', rowNum, record) : Api.create('PROD', record);
    op.then(function () {
      closeModal(); toast(rowNum ? 'Producción actualizada' : 'Producción registrada'); loadProdData(true);
    }).catch(function (err) { setBtnLoading(btn, false); toast(err.message, true); });
  }

  // Fecha 'DD/MM/AAAA' del último día del período seleccionado.
  function lastDayStr() {
    var a = state.period.anio, m = state.period.mes, d = new Date(a, m, 0).getDate();
    return ('0' + d).slice(-2) + '/' + ('0' + m).slice(-2) + '/' + a;
  }
  // Fecha 'DD/MM/AAAA' del primer día del mes siguiente al período.
  function firstNextStr() {
    var a = state.period.anio, m = state.period.mes;
    var nm = m === 12 ? 1 : m + 1, na = m === 12 ? a + 1 : a;
    return '01/' + ('0' + nm).slice(-2) + '/' + na;
  }
  // Insumos con valor en el mes: cantidad y total acumulados + precio promedio ponderado.
  function mpInsumosMes() {
    var rows = (state.mpprod.mp.rows || []).filter(function (r) { return inPeriod(r['Fecha']); });
    var map = {};
    rows.forEach(function (r) {
      var name = r['Nombre']; if (!name) return;
      if (!map[name]) map[name] = { nombre: name, id: r['ID insumo'] || '', cant: 0, total: 0 };
      map[name].cant += toNum(r['Cantidad']); map[name].total += toNum(r['Total']);
    });
    return Object.keys(map).map(function (k) {
      var m = map[k]; m.pond = m.cant > 0 ? m.total / m.cant : 0; return m;
    }).filter(function (m) { return m.cant > 0; });
  }
  // Productos con stock (unidades netas > 0) en el mes.
  function prodProductosMes() {
    var rows = (state.mpprod.prod.rows || []).filter(function (r) { return inPeriod(r['Fecha']); });
    var map = {};
    rows.forEach(function (r) {
      var p = r['Producto']; if (!p) return;
      if (!map[p]) map[p] = { producto: p, art: r['Artículo'] || '', cat: r['Categoría'] || '', uds: 0 };
      map[p].uds += toNum(r['Unidades']);
    });
    return Object.keys(map).map(function (k) { return map[k]; }).filter(function (m) { return m.uds > 0; });
  }

  function openSaldosModal(tab) {
    var isMp = tab === 'mp';
    var items = isMp ? mpInsumosMes() : prodProductosMes();
    var per = MONTHS[state.period.mes - 1] + ' ' + state.period.anio;
    var intro = '<div class="fld-label" style="margin-bottom:14px; text-transform:none; letter-spacing:0; color:var(--color-text-2);">' +
      'Contá lo que sobró al cierre de ' + per + '. Se descuenta de este mes (último día) y se suma como saldo inicial el 1° del mes siguiente.</div>';
    var body;
    if (items.length === 0) {
      body = intro + emptyHtml(isMp ? 'package' : 'utensils', 'Sin ' + (isMp ? 'insumos' : 'productos') + ' con stock', 'No hay registros en ' + per + '.');
      openModal({ title: 'Saldos finales · ' + (isMp ? 'Materia prima' : 'Producción'), body: body, saveLabel: 'Cerrar', onSave: function () { closeModal(); } });
      drawIcons(); return;
    }
    var listHtml = items.map(function (it, i) {
      if (isMp) {
        return '<div class="sf-row">' +
          '<div class="sf-name">' + escapeHtml(it.nombre) + '</div>' +
          '<div class="sf-fields">' +
            '<input id="sf-cant-' + i + '" class="fld-input" placeholder="Cantidad sobrante" value="">' +
            '<div><input id="sf-precio-' + i + '" class="fld-input mono" value="' + Math.round(it.pond) + '">' +
              '<div class="sf-hint">Prom. pond.: ' + money(it.pond) + '</div></div>' +
          '</div></div>';
      }
      return '<div class="sf-row">' +
        '<div class="sf-name">' + escapeHtml(it.producto) + '</div>' +
        '<input id="sf-uds-' + i + '" class="fld-input" placeholder="Unidades sobrantes" value=""></div>';
    }).join('');
    openModal({
      title: 'Saldos finales · ' + (isMp ? 'Materia prima' : 'Producción'),
      body: intro + '<div class="sf-list">' + listHtml + '</div>',
      saveLabel: 'Guardar saldos',
      onSave: function (btn) { saveSaldos(btn, isMp, items); }
    });
  }

  function saveSaldos(btn, isMp, items) {
    var sf = lastDayStr(), si = firstNextStr(), records = [];
    items.forEach(function (it, i) {
      if (isMp) {
        var cant = toNum($('sf-cant-' + i).value);
        if (!(cant > 0)) return;
        var precio = toNum($('sf-precio-' + i).value);
        var tot = cant * precio;
        records.push({ sheet: 'MP', rec: { 'Fecha': sf, 'ID insumo': it.id, 'Nombre': it.nombre, 'Cantidad': -cant, 'Precio unitario': precio, 'Total': -tot } });
        records.push({ sheet: 'MP', rec: { 'Fecha': si, 'ID insumo': it.id, 'Nombre': it.nombre, 'Cantidad': cant, 'Precio unitario': precio, 'Total': tot } });
      } else {
        var uds = toNum($('sf-uds-' + i).value);
        if (!(uds > 0)) return;
        records.push({ sheet: 'PROD', rec: { 'Fecha': sf, 'Categoría': it.cat, 'Artículo': it.art, 'Producto': it.producto, 'Unidades': -uds, 'OBS1': 'SF', 'Descuento': '' } });
        records.push({ sheet: 'PROD', rec: { 'Fecha': si, 'Categoría': it.cat, 'Artículo': it.art, 'Producto': it.producto, 'Unidades': uds, 'OBS1': 'SI', 'Descuento': '' } });
      }
    });
    if (records.length === 0) { toast('Ingresá al menos una cantidad', true); return; }
    setBtnLoading(btn, true, 'Guardar saldos');
    Promise.all(records.map(function (x) { return Api.create(x.sheet, x.rec); })).then(function () {
      closeModal(); toast('Saldos registrados (' + (records.length / 2) + ' ítems)');
      if (isMp) loadMpData(true); else loadProdData(true);
    }).catch(function (err) { setBtnLoading(btn, false); toast(err.message, true); });
  }

  function deleteMpProd(kind, rowNum) {
    var sheet = kind === 'mp' ? 'MP' : 'PROD';
    if (!confirm('¿Eliminar este registro?')) return;
    showLoader(true);
    Api.remove(sheet, rowNum).then(function () {
      showLoader(false); toast('Registro eliminado');
      if (kind === 'mp') loadMpData(true); else loadProdData(true);
    }).catch(function (err) { showLoader(false); toast(err.message, true); });
  }

  /* ----------------------------- configuración ----------------------------- */
  var CFG_SECTIONS = [
    { key: 'mp',    label: 'Materias primas',      icon: 'wheat-off',       sheet: 'ListaMP',   listKey: 'insumos',   cols: ['Código', 'Nombre', 'Categoría'],            sub: 'Lista maestra de insumos',   add: 'Agregar insumo' },
    { key: 'prod',  label: 'Productos terminados', icon: 'utensils',        sheet: 'ListaProd', listKey: 'productos',  cols: ['Categoría', 'Artículo', 'Producto', 'Modelo de loteo', 'Kg por envase'], sub: 'Catálogo de pastas · el precio se edita en la solapa Precios', add: 'Agregar producto' },
    { key: 'mov',   label: 'Tipos de movimiento',  icon: 'arrow-left-right', sheet: 'Glosario',  listKey: 'glosario',   cols: ['Concepto', 'Clasificación', 'Aplica IVA'],   sub: 'Clasificaciones de gasto',   add: 'Agregar tipo' },
    { key: 'cli',   label: 'Clientes y canales',   icon: 'store',           sheet: 'Listas',    listKey: 'canales',    cols: ['Nombre', 'Categoría', 'Vigencia'],           sub: 'Cuentas y canales de venta', add: 'Agregar cliente' },
    { key: 'users', label: 'Usuarios autorizados', icon: 'users',           sheet: 'Usuarios',  listKey: 'usuarios',   cols: ['Email', 'Rol'],                              sub: 'Cuentas con acceso a la app', add: 'Invitar usuario' }
  ];
  function cfgSection() { return CFG_SECTIONS.filter(function (s) { return s.key === state.config.section; })[0] || CFG_SECTIONS[0]; }
  function cfgRows(sec) { return ((state.lists && state.lists[sec.listKey]) || []); }
  function isAdmin() { return state.user && state.user.rol === 'admin'; }

  function renderConfig() {
    var sec = cfgSection();
    var nav = CFG_SECTIONS.map(function (s) {
      return '<div class="cfg-nav-item' + (s.key === sec.key ? ' is-active' : '') + '" data-sec="' + s.key + '">' +
        '<span class="ico"><i data-lucide="' + s.icon + '"></i></span><span>' + s.label + '</span></div>';
    }).join('');

    var addBtn = isAdmin() ? '<button class="cfg-add" id="cfg-add"><span class="ico"><i data-lucide="plus"></i></span>' + sec.add + '</button>' : '';
    var banner = sec.key === 'users'
      ? '<div class="notice notice-info" style="margin-bottom:18px;"><span class="ico" style="width:16px;height:16px;"><i data-lucide="shield-check"></i></span>Sólo las cuentas de esta lista pueden iniciar sesión. Cualquier otra verá la pantalla de acceso denegado.</div>'
      : '';
    if (!isAdmin()) banner += '<div class="notice notice-info" style="margin-bottom:18px;"><span class="ico" style="width:16px;height:16px;"><i data-lucide="lock-keyhole"></i></span>Sólo un administrador puede editar estas listas.</div>';

    var table = sec.key === 'users' ? cfgUsersTable(sec) : cfgListTable(sec);

    $('view').innerHTML =
      '<div class="config-layout"><div class="config-side">' + nav + '</div>' +
      '<div class="config-main">' +
        '<div class="cfg-head"><div><div class="cfg-title">' + sec.label + '</div><div class="cfg-sub">' + sec.sub + '</div></div>' + addBtn + '</div>' +
        banner + table +
      '</div></div>';

    Array.prototype.forEach.call($('view').querySelectorAll('[data-sec]'), function (el) {
      el.addEventListener('click', function () { state.config.section = el.getAttribute('data-sec'); renderConfig(); });
    });
    if (isAdmin()) {
      var add = $('cfg-add'); if (add) add.addEventListener('click', function () { openCfgModal(sec, null); });
      wireCfgRowActions(sec);
    }
    drawIcons();
  }

  function cfgListTable(sec) {
    var rows = cfgRows(sec);
    if (rows.length === 0) return emptyHtml(sec.icon, 'Lista vacía', isAdmin() ? 'Agregá el primer registro.' : 'Todavía no hay registros.');
    var cols = sec.cols;
    var head = '<div class="dt-head">' + cols.map(function (c) {
      var lbl = (sec.key === 'cli' && c === 'Categoría') ? 'Canal' : c;
      return '<div>' + escapeHtml(lbl) + '</div>';
    }).join('') + '<div></div></div>';
    var trs = rows.map(function (r) {
      var cells = cols.map(function (c, i) {
        var val = r[c];
        if (c === 'Código') return '<div class="cfg-cell-code">' + escapeHtml(val || '') + '</div>';
        if (i === 0) return '<div class="muted">' + escapeHtml(val || '') + '</div>';
        if (i === 1) {
          var tagProd = (sec.key === 'mp' && ivaTrue(r['Es producto']))
            ? ' <span class="badge badge-sm badge-online" style="margin-left:6px;">también producto</span>' : '';
          return '<div style="font-weight:500;">' + escapeHtml(val || '') + tagProd + '</div>';
        }
        return '<div><span class="badge badge-sm badge-neutral">' + escapeHtml(val || '—') + '</span></div>';
      }).join('');
      var actions = isAdmin() ? (sec.key === 'prod' ? prodRowActionsHtml(r._row) : rowActionsHtml(r._row)) : '<div></div>';
      return '<div class="dt-row">' + cells + actions + '</div>';
    }).join('');
    return '<div class="data-table cfg-list cfg-cols-' + cols.length + (sec.key === 'prod' ? ' cfg-prod' : '') + '">' + head + trs + '</div>';
  }

  function cfgUsersTable(sec) {
    var rows = cfgRows(sec);
    if (rows.length === 0) return emptyHtml('users', 'Sin usuarios', 'Invitá al primer socio.');
    var head = '<div class="dt-head"><div>Cuenta de Google</div><div>Rol</div><div></div></div>';
    var trs = rows.map(function (r) {
      var email = r['Email'] || '', rol = (r['Rol'] || 'socio');
      var badge = /admin/i.test(rol) ? 'badge-minorista' : 'badge-neutral';
      return '<div class="dt-row">' +
        '<div class="cfg-user-cell"><div class="user-avatar">' + escapeHtml(email.slice(0, 2).toUpperCase()) + '</div>' +
          '<div class="mono" style="font-size:12.5px;">' + escapeHtml(email) + '</div></div>' +
        '<div><span class="badge badge-sm ' + badge + '">' + escapeHtml(rol) + '</span></div>' +
        (isAdmin() ? rowActionsHtml(r._row) : '<div></div>') + '</div>';
    }).join('');
    return '<div class="data-table cfg-users">' + head + trs + '</div>';
  }

  function wireCfgRowActions(sec) {
    var v = $('view');
    Array.prototype.forEach.call(v.querySelectorAll('[data-edit]'), function (el) {
      el.addEventListener('click', function () {
        var n = Number(el.getAttribute('data-edit'));
        var row = cfgRows(sec).filter(function (r) { return r._row === n; })[0] || null;
        openCfgModal(sec, row);
      });
    });
    Array.prototype.forEach.call(v.querySelectorAll('[data-del]'), function (el) {
      el.addEventListener('click', function () { deleteCfg(sec, Number(el.getAttribute('data-del'))); });
    });
    Array.prototype.forEach.call(v.querySelectorAll('[data-receta]'), function (el) {
      el.addEventListener('click', function () {
        var n = Number(el.getAttribute('data-receta'));
        var row = cfgRows(sec).filter(function (r) { return r._row === n; })[0] || null;
        if (row) openRecetaModal(row);
      });
    });
  }

  /* ----------------------------- recetas ----------------------------- */
  var recetaCtx = null;

  function insumoOptions(sel) {
    return insumosLista().map(function (i) {
      var val = i['Código'] || i['Nombre'] || '';
      var label = (i['Código'] ? i['Código'] + ' · ' : '') + (i['Nombre'] || '');
      return '<option value="' + escapeHtml(val) + '"' + (val === sel ? ' selected' : '') + '>' + escapeHtml(label) + '</option>';
    }).join('');
  }
  function renderRecLines() {
    var host = $('rec-lines'); if (!host || !recetaCtx) return;
    host.innerHTML = recetaCtx.lines.map(function (ln, idx) {
      return '<div class="rec-line" data-i="' + idx + '">' +
        '<select class="fld-input fld-select rec-insumo"><option value="">Elegir materia prima…</option>' + insumoOptions(ln.insumo) + '</select>' +
        '<input class="fld-input mono rec-gr" inputmode="decimal" placeholder="0" value="' + escapeHtml(ln.gr === '' || ln.gr == null ? '' : String(ln.gr)) + '">' +
        '<span class="icon-btn danger rec-del" title="Quitar"><span class="ico"><i data-lucide="trash-2"></i></span></span>' +
        '</div>';
    }).join('');
    Array.prototype.forEach.call(host.querySelectorAll('.rec-del'), function (el) {
      el.addEventListener('click', function () {
        collectRecLines();
        var i = Number(el.parentNode.getAttribute('data-i'));
        recetaCtx.lines.splice(i, 1);
        if (!recetaCtx.lines.length) recetaCtx.lines.push({ insumo: '', gr: '' });
        renderRecLines(); drawIcons();
      });
    });
  }
  function collectRecLines() {
    var host = $('rec-lines'); if (!host || !recetaCtx) return;
    Array.prototype.forEach.call(host.querySelectorAll('.rec-line'), function (row) {
      var i = Number(row.getAttribute('data-i'));
      recetaCtx.lines[i] = { insumo: row.querySelector('.rec-insumo').value, gr: row.querySelector('.rec-gr').value };
    });
  }
  function openRecetaModal(prodRow) {
    var producto = prodRow['Producto'] || '', kg = prodRow['Kg por envase'];
    var nombreProd = ((prodRow['Artículo'] ? prodRow['Artículo'] + ' ' : '') + producto).trim();
    if (!insumosLista().length) { toast('Primero cargá materias primas en Configuración', true); return; }
    showLoader(true);
    Api.list('Recetas').then(function (rows) {
      showLoader(false);
      var existing = (rows || []).filter(function (r) { return r['Producto'] === producto; })[0] || null;
      var ings = [];
      if (existing && existing['Ingredientes']) { try { ings = JSON.parse(existing['Ingredientes']) || []; } catch (e) { ings = []; } }
      var lines = ings.length ? ings.map(function (g) { return { insumo: g.insumo || '', gr: g.gr != null ? g.gr : '' }; }) : [{ insumo: '', gr: '' }];
      recetaCtx = { lines: lines, producto: producto, kg: kg, row: existing ? existing._row : null };

      var body =
        '<div class="cfg-sub" style="margin-bottom:16px;">Kg por envase: <b>' + escapeHtml(kg != null && kg !== '' ? String(kg) : '—') + '</b></div>' +
        '<div class="rec-head"><div>Materia prima</div><div class="r-right">Gramos</div><div></div></div>' +
        '<div id="rec-lines"></div>' +
        '<button class="btn btn-secondary" id="rec-add" style="margin-top:10px;"><span class="ico"><i data-lucide="plus"></i></span>Agregar materia prima</button>';
      openModal({
        title: 'RECETA de ' + nombreProd,
        body: body,
        saveLabel: 'Guardar receta',
        onSave: function (btn) { saveReceta(btn); }
      });
      renderRecLines();
      $('rec-add').addEventListener('click', function () {
        collectRecLines(); recetaCtx.lines.push({ insumo: '', gr: '' }); renderRecLines(); drawIcons();
      });
      drawIcons();
    }).catch(function (err) { showLoader(false); toast(err.message, true); });
  }
  function saveReceta(btn) {
    if (!recetaCtx) return;
    collectRecLines();
    var ings = recetaCtx.lines.map(function (ln) {
      var gr = toNum(ln.gr);
      if (!ln.insumo || !(gr > 0)) return null;
      var mp = insumosLista().filter(function (i) { return (i['Código'] || i['Nombre']) === ln.insumo; })[0] || {};
      return { insumo: ln.insumo, nombre: mp['Nombre'] || '', gr: gr };
    }).filter(Boolean);
    if (!ings.length) { toast('Agregá al menos una materia prima con sus gramos', true); return; }
    setBtnLoading(btn, true, 'Guardar receta');
    var rec = { 'Producto': recetaCtx.producto, 'Kg por envase': (recetaCtx.kg == null ? '' : recetaCtx.kg), 'Ingredientes': JSON.stringify(ings) };
    var op = recetaCtx.row ? Api.update('Recetas', recetaCtx.row, rec) : Api.create('Recetas', rec);
    op.then(function () { closeModal(); toast('Receta guardada'); })
      .catch(function (err) { setBtnLoading(btn, false, 'Guardar receta'); toast(err.message, true); });
  }

  /* ------------------- receta estampada por producción (consumo) ------------------- */
  var consumoCtx = null;

  function prodKey(r) {
    return String(r['reqId'] || ('P|' + (r['Producto'] || '') + '|' + (r['Lote'] || '') + '|' + (r['Fecha'] || '')));
  }
  function mpLoteOptions(mpRows, insumoCod, insumoNom, selRef) {
    var matches = mpRows.filter(function (m) {
      return (insumoCod && String(m['ID insumo'] || '') === insumoCod) || (insumoNom && String(m['Nombre'] || '') === insumoNom);
    });
    var opts = matches.length ? matches : mpRows;
    var html = '<option value="">Elegir lote…</option>';
    html += opts.map(function (m) {
      var ref = String(m['reqId'] || m._row);
      var label = (m['Nombre'] || '') + ' · Lote ' + (m['Lote'] || '—') + (m['Proveedor'] ? ' (' + m['Proveedor'] + ')' : '');
      return '<option value="' + escapeHtml(ref) + '"' + (ref === selRef ? ' selected' : '') + '>' + escapeHtml(label) + '</option>';
    }).join('');
    return html;
  }
  function renderConsLines() {
    var host = $('cons-lines'); if (!host || !consumoCtx) return;
    host.innerHTML = consumoCtx.lines.map(function (ln, idx) {
      return '<div class="cons-line" data-i="' + idx + '">' +
        '<div class="cons-mp">' + escapeHtml(ln.nombre || ln.insumo || '—') + '</div>' +
        '<div class="cons-val mono">' + num(ln.valor) + ' g</div>' +
        '<select class="fld-input fld-select cons-lote">' + mpLoteOptions(consumoCtx.mp, ln.insumo, ln.nombre, ln.mpRef || '') + '</select>' +
        '</div>';
    }).join('');
  }
  function collectConsLines() {
    var host = $('cons-lines'); if (!host || !consumoCtx) return;
    Array.prototype.forEach.call(host.querySelectorAll('.cons-line'), function (row) {
      var i = Number(row.getAttribute('data-i'));
      var ref = row.querySelector('.cons-lote').value;
      var mp = consumoCtx.mp.filter(function (m) { return String(m['reqId'] || m._row) === ref; })[0] || null;
      consumoCtx.lines[i].mpRef = ref;
      consumoCtx.lines[i].lote = mp ? (mp['Lote'] || '') : '';
      consumoCtx.lines[i].proveedor = mp ? (mp['Proveedor'] || '') : '';
      consumoCtx.lines[i].vto = mp ? (mp['Fecha Vto'] || '') : '';
    });
  }
  // Devuelve la receta estampada de una fila de producción, o null.
  function recProdFor(prodRow) {
    var key = prodKey(prodRow);
    return ((state.mpprod.recProd || []).filter(function (r) { return String(r['reqId prod']) === key; })[0]) || null;
  }
  function recProdIngs(rec) {
    if (!rec || !rec['Ingredientes']) return [];
    try { return JSON.parse(rec['Ingredientes']) || []; } catch (e) { return []; }
  }
  // Completa = tiene ingredientes y todos con lote asignado.
  function consumoCompleto(prodRow) {
    var ings = recProdIngs(recProdFor(prodRow));
    return ings.length > 0 && ings.every(function (g) { return g.lote && String(g.lote).trim() !== ''; });
  }
  function openConsumoModal(prodRow) {
    var producto = prodRow['Producto'] || '';
    var nombreProd = ((prodRow['Artículo'] ? prodRow['Artículo'] + ' ' : '') + producto).trim();
    var units = toNum(prodRow['Unidades']);
    var key = prodKey(prodRow);
    showLoader(true);
    Promise.all([Api.list('Recetas'), Api.list('MP'), Api.list('RecetasProd')]).then(function (res) {
      showLoader(false);
      var recetas = res[0] || [], mpRows = res[1] || [], recProd = res[2] || [];
      var stamped = recProd.filter(function (r) { return String(r['reqId prod']) === key; })[0] || null;
      var lines;
      if (stamped && stamped['Ingredientes']) {
        var st = []; try { st = JSON.parse(stamped['Ingredientes']) || []; } catch (e) { st = []; }
        lines = st.map(function (g) { return { insumo: g.insumo || '', nombre: g.nombre || '', gr: g.gr, valor: g.valor, mpRef: g.mpRef || '', lote: g.lote || '', proveedor: g.proveedor || '', vto: g.vto || '' }; });
      } else {
        var base = recetas.filter(function (r) { return r['Producto'] === producto; })[0] || null;
        var ings = [];
        if (base && base['Ingredientes']) { try { ings = JSON.parse(base['Ingredientes']) || []; } catch (e2) { ings = []; } }
        lines = ings.map(function (g) { var gr = toNum(g.gr); return { insumo: g.insumo || '', nombre: g.nombre || '', gr: gr, valor: gr * units, mpRef: '', lote: '', proveedor: '', vto: '' }; });
      }
      if (!lines.length) { toast('El producto no tiene receta cargada en Configuración', true); return; }
      consumoCtx = { lines: lines, mp: mpRows, key: key, producto: producto, lote: prodRow['Lote'] || '', row: stamped ? stamped._row : null };

      var body =
        '<div class="cfg-sub" style="margin-bottom:14px;">Consumo para ' + escapeHtml(num(units)) + ' unidad(es)' + (stamped ? ' · <b>receta estampada</b>' : '') + '</div>' +
        '<div class="cons-head"><div>Materia prima</div><div class="r-right">Consumo</div><div>Lote / insumo usado</div></div>' +
        '<div id="cons-lines"></div>';
      openModal({
        title: nombreProd,
        body: body,
        saveLabel: 'Guardar receta',
        onSave: function (btn) { saveConsumo(btn); }
      });
      renderConsLines();
      drawIcons();
    }).catch(function (err) { showLoader(false); toast(err.message, true); });
  }
  function saveConsumo(btn) {
    if (!consumoCtx) return;
    collectConsLines();
    var ings = consumoCtx.lines.map(function (ln) {
      return { insumo: ln.insumo, nombre: ln.nombre, gr: ln.gr, valor: ln.valor, mpRef: ln.mpRef || '', lote: ln.lote || '', proveedor: ln.proveedor || '', vto: ln.vto || '' };
    });
    setBtnLoading(btn, true, 'Guardar receta');
    var rec = { 'reqId prod': consumoCtx.key, 'Producto': consumoCtx.producto, 'Lote': consumoCtx.lote, 'Ingredientes': JSON.stringify(ings) };
    var op = consumoCtx.row ? Api.update('RecetasProd', consumoCtx.row, rec) : Api.create('RecetasProd', rec);
    op.then(function () {
      closeModal(); toast('Receta de producción guardada');
      Api.list('RecetasProd').then(function (rows) { state.mpprod.recProd = rows; if (state.route === 'mp' && state.mpprod.tab === 'prod') renderMpProd(); }).catch(function () {});
    }).catch(function (err) { setBtnLoading(btn, false, 'Guardar receta'); toast(err.message, true); });
  }

  // Insumos: categorías fijas y prefijo de código autogenerado.
  var MP_CATS = ['Secos', 'Refrigerados', 'Frescos', 'Insumos', 'Otros'];
  var MP_CODE_PREFIX = { 'Secos': 'MPS', 'Refrigerados': 'MPR', 'Frescos': 'MPF', 'Insumos': 'MPI', 'Otros': 'MPO' };
  function nextInsumoCode(cat) {
    var prefix = MP_CODE_PREFIX[cat] || 'MPO';
    var re = new RegExp('^' + prefix + '-(\\d+)$'), max = 0;
    insumosLista().forEach(function (i) {
      var m = String(i['Código'] || '').match(re);
      if (m) { var n = parseInt(m[1], 10); if (n > max) max = n; }
    });
    return prefix + '-' + ('000' + (max + 1)).slice(-4);
  }

  function openCfgModal(sec, row) {
    var ed = !!row;
    var body;
    if (sec.key === 'mp') {
      var curCat = (ed && row['Categoría']) || MP_CATS[0];
      var cats = (curCat && MP_CATS.indexOf(curCat) < 0) ? [curCat].concat(MP_CATS) : MP_CATS;
      var onP = ed && ivaTrue(row['Es producto']);
      body =
        '<div style="margin-bottom:16px;"><div class="fld-label">Categoría</div>' + optGroupHtml('cfg-cat', cats, curCat) + '</div>' +
        '<div style="margin-bottom:16px;">' + fld('Nombre', '<input id="cfg-nombre" class="fld-input" placeholder="Nombre del insumo" value="' + escapeHtml(ed ? (row['Nombre'] || '') : '') + '"><div class="fld-err" id="ecfg-nombre"></div>') + '</div>' +
        (ed && row['Código'] ? '<div style="margin-bottom:16px;"><div class="fld-label">Código</div><div class="fld-input mono" style="background:var(--row-hover); color:var(--color-text-2); display:flex; align-items:center;">' + escapeHtml(row['Código']) + '</div></div>' : '') +
        '<div class="iva-box' + (onP ? ' is-on' : '') + '" id="cfg-esprod" style="margin-bottom:4px;">' +
          '<span class="iva-mark"><span class="ico"><i data-lucide="check"></i></span></span>Es también producto</div>' +
        '<div style="font-size:11px; color:var(--color-text-3); margin-bottom:8px;">El código se asigna automático según la categoría (Secos MPS, Refrigerados MPR, Insumos MPI, Otros MPO). Al marcarlo «también producto», la compra se suma a Producción.</div>';
    } else {
      body = sec.cols.map(function (col, i) {
        var val = ed ? (row[col] || '') : '';
        if (col === 'Rol') return '<div style="margin-bottom:16px;"><div class="fld-label">Rol</div>' + optGroupHtml('cfg-' + i, ['admin', 'socio'], val || 'socio') + '</div>';
        if (col === 'Categoría' && sec.key === 'cli') return '<div style="margin-bottom:16px;"><div class="fld-label">Canal</div>' + optGroupHtml('cfg-' + i, ['Mayorista', 'Minorista'], val || 'Minorista') + '</div>';
        if (col === 'Aplica IVA') return '<div style="margin-bottom:16px;"><div class="fld-label">Aplica IVA</div>' + optGroupHtml('cfg-' + i, ['Sí', 'No'], val || 'No') + '</div>';
        if (col === 'Clasificación') {
          var opciones = (val && CLASIF_FIJAS.indexOf(val) < 0) ? [val].concat(CLASIF_FIJAS) : CLASIF_FIJAS;
          var optsHtml = opciones.map(function (o) { return '<option value="' + escapeHtml(o) + '"' + (o === val ? ' selected' : '') + '>' + escapeHtml(o) + '</option>'; }).join('');
          return '<div style="margin-bottom:16px;">' + fld(col, '<select id="cfg-' + i + '" class="fld-input fld-select">' + optsHtml + '</select>') + '</div>';
        }
        var type = col === 'Email' ? ' mono' : '';
        return '<div style="margin-bottom:16px;">' + fld(col, '<input id="cfg-' + i + '" class="fld-input' + type + '" placeholder="' + escapeHtml(col) + '" value="' + escapeHtml(val) + '"><div class="fld-err" id="ecfg-' + i + '"></div>') + '</div>';
      }).join('');
    }

    openModal({
      title: ed ? 'Editar registro' : sec.add,
      body: body,
      saveLabel: ed ? 'Guardar cambios' : 'Guardar',
      onSave: function (btn) { saveCfg(btn, sec, ed ? row._row : null); }
    });

    if (sec.key === 'mp') $('cfg-esprod').addEventListener('click', function () { this.classList.toggle('is-on'); });
  }

  function saveCfg(btn, sec, rowNum) {
    if (sec.key === 'mp') {
      var cat = optGroupVal('cfg-cat');
      var nombre = $('cfg-nombre').value.trim();
      if (!nombre) { fieldError('cfg-nombre', 'ecfg-nombre', 'Nombre obligatorio'); return; }
      fieldOk('cfg-nombre', 'ecfg-nombre');
      var existing = rowNum ? (cfgRows(sec).filter(function (r) { return r._row === rowNum; })[0] || {}) : {};
      var codigo = (existing['Código'] && String(existing['Código']).trim()) ? existing['Código'] : nextInsumoCode(cat);
      var recMp = { 'Código': codigo, 'Nombre': nombre, 'Categoría': cat, 'Es producto': $('cfg-esprod').classList.contains('is-on') ? 'Sí' : 'No' };
      setBtnLoading(btn, true, rowNum ? 'Guardar cambios' : 'Guardar');
      var opMp = rowNum ? Api.update(sec.sheet, rowNum, recMp) : Api.create(sec.sheet, recMp);
      opMp.then(function () { return reloadLists(); }).then(function () {
        closeModal(); toast(rowNum ? 'Insumo actualizado' : 'Insumo agregado · ' + codigo);
      }).catch(function (err) { setBtnLoading(btn, false); toast(err.message, true); });
      return;
    }
    var record = {}, ok = true;
    sec.cols.forEach(function (col, i) {
      var val;
      if (col === 'Rol' || col === 'Aplica IVA' || (col === 'Categoría' && sec.key === 'cli')) val = optGroupVal('cfg-' + i);
      else val = $('cfg-' + i).value.trim();
      record[col] = val;
    });
    // validación: primera columna obligatoria; email válido para Usuarios
    var firstCol = sec.cols[0];
    if (sec.key === 'users') {
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(record['Email'])) { fieldError('cfg-0', 'ecfg-0', 'Email inválido'); ok = false; } else fieldOk('cfg-0', 'ecfg-0');
    } else if (!record[firstCol]) {
      fieldError('cfg-0', 'ecfg-0', firstCol + ' obligatorio'); ok = false;
    } else fieldOk('cfg-0', 'ecfg-0');
    if (!ok) return;

    setBtnLoading(btn, true, rowNum ? 'Guardar cambios' : 'Guardar');
    var op = rowNum ? Api.update(sec.sheet, rowNum, record) : Api.create(sec.sheet, record);
    op.then(function () { return reloadLists(); }).then(function () {
      closeModal(); toast(rowNum ? 'Registro actualizado' : 'Registro agregado');
    }).catch(function (err) { setBtnLoading(btn, false); toast(err.message, true); });
  }

  function deleteCfg(sec, rowNum) {
    if (!confirm('¿Eliminar este registro?')) return;
    showLoader(true);
    Api.remove(sec.sheet, rowNum).then(function () { return reloadLists(); }).then(function () {
      showLoader(false); toast('Registro eliminado');
    }).catch(function (err) { showLoader(false); toast(err.message, true); });
  }

  function reloadLists() {
    return Api.lists().then(function (lists) {
      state.lists = lists;
      if (state.route === 'config') renderConfig();
    });
  }

  /* ----------------------------- modal (infra compartida) ----------------------------- */
  function fld(label, inner) { return '<div class="fld"><div class="fld-label">' + label + '</div>' + inner + '</div>'; }
  function moneyInput(id, val) { return '<input id="' + id + '" class="fld-input mono" placeholder="0" value="' + (val != null && val !== '' ? escapeHtml(String(val)) : '') + '">'; }
  function optGroupHtml(name, options, selected) {
    return '<div class="opt-group" data-group="' + name + '">' + options.map(function (o) {
      return '<span class="opt' + (o === selected ? ' is-active' : '') + '" data-val="' + escapeHtml(o) + '">' + escapeHtml(o) + '</span>';
    }).join('') + '</div>';
  }
  function optGroupVal(name) {
    var el = $('modal-root').querySelector('[data-group="' + name + '"] .opt.is-active');
    return el ? el.getAttribute('data-val') : '';
  }
  function setOptGroup(name, val) {
    Array.prototype.forEach.call($('modal-root').querySelectorAll('[data-group="' + name + '"] .opt'), function (el) {
      el.classList.toggle('is-active', el.getAttribute('data-val') === val);
    });
  }
  function fieldError(inputId, errId, msg) { $(inputId).classList.add('has-error'); if ($(errId)) $(errId).textContent = msg; }
  function fieldOk(inputId, errId) { $(inputId).classList.remove('has-error'); if ($(errId)) $(errId).textContent = ''; }
  function setBtnLoading(btn, on, label) {
    if (!btn) return;
    btn.disabled = on;
    btn.innerHTML = on ? '<span class="spinner"></span>' + (label || 'Guardando…') : (label || btn.textContent);
  }

  function openModal(opts) {
    var root = $('modal-root');
    root.innerHTML = '<div class="gv-modal">' +
      '<div class="gv-modal-head"><div class="gv-modal-title">' + escapeHtml(opts.title) + '</div>' +
        '<span class="ico" id="modal-x" style="width:20px; height:20px; color:var(--color-text-3); cursor:pointer;"><i data-lucide="x"></i></span></div>' +
      '<div class="gv-modal-body">' + opts.body + '</div>' +
      '<div class="gv-modal-foot"><button class="btn btn-secondary" id="modal-cancel">Cancelar</button>' +
        '<button class="btn btn-primary" id="modal-save">' + escapeHtml(opts.saveLabel || 'Guardar') + '</button></div>' +
      '</div>';
    root.classList.remove('is-hidden');
    $('modal-x').onclick = closeModal;
    $('modal-cancel').onclick = closeModal;
    $('modal-save').onclick = function () { opts.onSave($('modal-save')); };
    Array.prototype.forEach.call(root.querySelectorAll('.opt-group'), function (g) {
      g.addEventListener('click', function (e) {
        var o = e.target.closest('.opt'); if (!o) return;
        Array.prototype.forEach.call(g.querySelectorAll('.opt'), function (x) { x.classList.remove('is-active'); });
        o.classList.add('is-active');
      });
    });
    makeModalDraggable(root.querySelector('.gv-modal'), root.querySelector('.gv-modal-head'));
    drawIcons();
  }

  // Permite arrastrar la ventana por su encabezado (mouse y touch). No se cierra al clickear afuera.
  function makeModalDraggable(modal, handle) {
    if (!modal || !handle) return;
    var dx = 0, dy = 0, sx = 0, sy = 0, dragging = false;
    handle.style.cursor = 'move';
    handle.addEventListener('pointerdown', function (e) {
      if (e.target.closest('#modal-x')) return;
      modal.style.animation = 'none'; // el fadeUp (fill both) fija transform:none y pisaría el arrastre
      dragging = true; sx = e.clientX; sy = e.clientY; e.preventDefault();
      try { handle.setPointerCapture(e.pointerId); } catch (_) {}
    });
    handle.addEventListener('pointermove', function (e) {
      if (!dragging) return;
      modal.style.transform = 'translate(' + (dx + e.clientX - sx) + 'px,' + (dy + e.clientY - sy) + 'px)';
    });
    handle.addEventListener('pointerup', function (e) {
      if (!dragging) return; dragging = false;
      dx += e.clientX - sx; dy += e.clientY - sy;
    });
  }

  function closeModal() { $('modal-root').classList.add('is-hidden'); $('modal-root').innerHTML = ''; }

  // expone lo necesario para depurar / extender
  window.GenovaApp = { state: state, toast: toast, closeModal: closeModal };

  document.addEventListener('DOMContentLoaded', start);
})();
