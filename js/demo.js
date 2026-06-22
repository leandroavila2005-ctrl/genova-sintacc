/**
 * MODO DEMO — datos de muestra en memoria, sin backend ni login de Google.
 * Se activa con GENOVA_CONFIG.DEMO_MODE = true.
 * ⚠️ Poné DEMO_MODE en false antes de subir a producción.
 */
(function () {
  if (!window.GENOVA_CONFIG || !window.GENOVA_CONFIG.DEMO_MODE) return;

  function pad(n) { return ('0' + n).slice(-2); }
  function toNum(v) { if (v === '' || v == null) return 0; var n = Number(String(v).replace(/[^0-9.\-]/g, '')); return isNaN(n) ? 0 : n; }
  function parseFecha(s) {
    var m = String(s).match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/); if (m) return { y: +m[3], mo: +m[2] };
    var i = String(s).match(/^(\d{4})-(\d{1,2})-(\d{1,2})/); if (i) return { y: +i[1], mo: +i[2] }; return null;
  }
  function toIso(s) { var m = String(s).match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/); return m ? (m[3] + '-' + pad(+m[2]) + '-' + pad(+m[1])) : s; }
  function delay(v) { return new Promise(function (res) { setTimeout(function () { res(v); }, 140); }); }
  function clone(x) { return JSON.parse(JSON.stringify(x)); }

  var db = { VENTAS: [], MOVIMIENTOS: [], MP: [], PROD: [], Listas: [], ListaMP: [], ListaProd: [], Glosario: [], Usuarios: [] };

  // ---- ventas (ene–jun 2026) ----
  [
    ['2026-01-12', 'La Plata Centro', 52000, 98000, 0, 'Minorista'],
    ['2026-01-20', 'Dist. Norte SA', 0, 0, 380000, 'Mayorista'],
    ['2026-01-28', 'Tienda Online', 0, 64000, 0, 'Online'],
    ['2026-02-10', 'La Plata Centro', 48000, 102000, 0, 'Minorista'],
    ['2026-02-18', 'Almacén Güemes', 30000, 0, 60000, 'Mayorista'],
    ['2026-02-25', 'Dist. Norte SA', 0, 0, 420000, 'Mayorista'],
    ['2026-03-08', 'Rest. Da Vinci', 0, 0, 240000, 'Mayorista'],
    ['2026-03-14', 'La Plata Centro', 60000, 110000, 0, 'Minorista'],
    ['2026-03-22', 'Tienda Online', 0, 82000, 0, 'Online'],
    ['2026-04-09', 'Dist. Norte SA', 0, 0, 450000, 'Mayorista'],
    ['2026-04-17', 'La Plata Centro', 55000, 99000, 0, 'Minorista'],
    ['2026-04-26', 'Almacén Güemes', 28000, 0, 72000, 'Mayorista'],
    ['2026-05-11', 'Rest. Da Vinci', 0, 0, 300000, 'Mayorista'],
    ['2026-05-19', 'La Plata Centro', 58000, 120000, 0, 'Minorista'],
    ['2026-05-27', 'Tienda Online', 0, 96000, 0, 'Online'],
    ['2026-06-05', 'Dist. Norte SA', 0, 0, 520000, 'Mayorista'],
    ['2026-06-10', 'La Plata Centro', 62000, 130000, 0, 'Minorista'],
    ['2026-06-14', 'Almacén Güemes', 35000, 0, 85000, 'Mayorista'],
    ['2026-06-16', 'Tienda Online', 0, 88000, 0, 'Online']
  ].forEach(function (a) {
    db.VENTAS.push({ 'Fecha': a[0], 'Lista/Canal': a[1], 'EFVO': a[2], 'Tarj o cta': a[3], 'MP': a[4], 'cat': a[5],
      'AÑO': +a[0].slice(0, 4), 'MES': +a[0].slice(5, 7), 'Totales': a[2] + a[3] + a[4] });
  });

  // ---- movimientos / MP / producción (generados ene–jun) ----
  function mov(fe, co, ob, mt, iv, cl) { return { 'Fecha': fe, 'Lista/Concepto': co, 'Observación': ob, 'Monto': mt, 'IVA': iv, 'Clasif': cl, 'AÑO': +fe.slice(0, 4), 'MES': +fe.slice(5, 7) }; }
  function mp(fe, id, no, ca, pr) { return { 'Fecha': fe, 'ID insumo': id, 'Nombre': no, 'Cantidad': ca, 'Precio unitario': pr, 'Total': toNum(ca) * pr, 'Mes': +fe.slice(5, 7) }; }
  function prod(fe, ca, ar, pr, ud) { return { 'Fecha': fe, 'Categoría': ca, 'Artículo': ar, 'Producto': pr, 'Unidades': ud, 'OBS1': '', 'Descuento': '0%', 'Mes': +fe.slice(5, 7) }; }
  for (var mo = 1; mo <= 6; mo++) {
    var f = (function (m) { return function (d) { return '2026-' + pad(m) + '-' + pad(d); }; })(mo);
    db.MOVIMIENTOS.push(
      mov(f(5), 'Sueldos quincena', 'Personal', 285000 + mo * 3000, 'No', 'Sueldos'),
      mov(f(8), 'Alquiler y servicios', 'Costos fijos', 120000, 'Sí', 'CF'),
      mov(f(12), 'Gastos administrativos', '', 95000, 'Sí', 'Gastos Adm'),
      mov(f(15), 'Publicidad redes', 'Comercial', 45000, 'Sí', 'Gastos Comercialización'),
      mov(f(20), 'Comisiones bancarias', '', 12000, 'No', 'Gastos Financieros')
    );
    db.MP.push(
      mp(f(3), 'MP-001', 'Harina premezcla sin TACC', '200 kg', 2960),
      mp(f(6), 'MP-003', 'Huevos', '120 doc', 2100),
      mp(f(9), 'MP-004', 'Queso muzzarella', '60 kg', 5400)
    );
    db.PROD.push(
      prod(f(14), 'Rellenas', 'Ravioles', 'Ravioles ricota y verdura', 460 + mo * 8),
      prod(f(14), 'Rellenas', 'Sorrentinos', 'Sorrentinos jamón y queso', 300 + mo * 6),
      prod(f(15), 'Ñoquis', 'Ñoquis', 'Ñoquis de papa', 250 + mo * 5),
      prod(f(15), 'Secas', 'Tallarines', 'Tallarín al huevo', 180 + mo * 4),
      prod(f(16), 'Rellenas', 'Capeletti', 'Capeletti de carne', 110 + mo * 3)
    );
  }

  // ---- listas maestras ----
  [['La Plata Centro', 'Minorista', 'Vigente'], ['Dist. Norte SA', 'Mayorista', 'Vigente'], ['Rest. Da Vinci', 'Mayorista', 'Vigente'], ['Almacén Güemes', 'Mayorista', 'Vigente'], ['Tienda Online', 'Online', 'Vigente']]
    .forEach(function (a) { db.Listas.push({ 'Nombre': a[0], 'Categoría': a[1], 'Vigencia': a[2] }); });
  [['MP-001', 'Harina premezcla sin TACC', 'Harinas', 'No'], ['MP-002', 'Fécula de mandioca', 'Harinas', 'No'], ['MP-003', 'Huevos', 'Frescos', 'No'], ['MP-004', 'Queso muzzarella', 'Frescos', 'Sí'], ['MP-005', 'Aceite de girasol', 'Insumos', 'No']]
    .forEach(function (a) { db.ListaMP.push({ 'Código': a[0], 'Nombre': a[1], 'Categoría': a[2], 'Es producto': a[3] }); });
  [['Rellenas', 'Ravioles', 'Ravioles ricota y verdura'], ['Rellenas', 'Sorrentinos', 'Sorrentinos jamón y queso'], ['Ñoquis', 'Ñoquis', 'Ñoquis de papa'], ['Secas', 'Tallarines', 'Tallarín al huevo'], ['Rellenas', 'Capeletti', 'Capeletti de carne']]
    .forEach(function (a) { db.ListaProd.push({ 'Categoría': a[0], 'Artículo': a[1], 'Producto': a[2] }); });
  [
    ['Compra de mercaderias menudeo', 'CF'],
    ['Materiales usados en la produccion', 'CF'],
    ['Fletes de mercaderia', 'CF'],
    ['Suministros de oficina', 'Gastos Administrativos'],
    ['Honorarios contador', 'Gastos Administrativos'],
    ['Honorarios abogado', 'Gastos Administrativos'],
    ['Honorarios Lic Seg e Hig', 'Gastos Administrativos'],
    ['Seguridad Privada', 'Gastos Administrativos'],
    ['Caja de seguridad', 'Gastos Administrativos'],
    ['Edelap', 'Gastos Administrativos'],
    ['Gas', 'Gastos Administrativos'],
    ['Telefono /Internet', 'Gastos Administrativos'],
    ['Municipal', 'Gastos Administrativos'],
    ['Inmobiliario', 'Gastos Administrativos'],
    ['Agua (ABSA)', 'Gastos Administrativos'],
    ['Fumigador', 'Gastos Administrativos'],
    ['Chanchero', 'Gastos Administrativos'],
    ['Centro de Fab. Pastas', 'Gastos Administrativos'],
    ['Alquileres locales comerciales', 'Gastos Comercialización'],
    ['Publicidades graficas, redes, etc', 'Gastos Comercialización'],
    ['Folletos, carteles', 'Gastos Comercialización'],
    ['Gastos el servicio de cobro con tarjetas, Posnet.', 'Gastos Comercialización'],
    ['Reparto delivery uso plataforma', 'Gastos Comercialización'],
    ['Seguros', 'Gastos Comercialización'],
    ['Honorarios asesor MK', 'Gastos Comercialización'],
    ['Comision por venta mayorista', 'Gastos Comercialización'],
    ['Honorarios manejo Redes', 'Gastos Comercialización'],
    ['Nafta-patente-seguro vehiculo', 'Gastos Comercialización'],
    ['Arreglos vehiculos (mantenimiento)', 'Gastos Comercialización'],
    ['Rdos en cta ctte (iva, cred%deb)', 'Gastos Comercialización'],
    ['Arreglo de maquinarias', 'Gastos Comercialización'],
    ['Ropa para el personal', 'Gastos Comercialización'],
    ['Intereses pagados por prestamos', 'Gastos Financieros'],
    ['Comisiones bancarias', 'Gastos Financieros'],
    ['Perdida por deterioro de activos (depreciacion)', 'Gastos Financieros'],
    ['Intereses planes Afip', 'Gastos Financieros'],
    ['Gastos Ext (litigios, desastres)', 'Otros Gtos No Operativos'],
    ['Gastos I&D (nuevas tecnologias)', 'Otros Gtos No Operativos'],
    ['Ganancia por tenencia de moneda ext', 'Otros Ing. No Operativos'],
    ['Ganancia por tenencia de activos financieros', 'Otros Ing. No Operativos'],
    ['IVA', 'Impuestos'],
    ['Tasa municipal', 'Impuestos'],
    ['Ant Gcias', 'Impuestos'],
    ['Autonomos y mon', 'Impuestos'],
    ['Ingresos Brutos', 'Impuestos'],
    ['Ganancias', 'Impuestos'],
    ['VENTAS', ''],
    ['MP', ''],
    ['Comisiones', 'Sueldos'],
    ['Aportes', 'Sueldos'],
    ['Sueldos', 'Sueldos'],
    ['Pago Proveedores', ''],
    ['Venta de Activos Fijos', 'Otros Ing. No Operativos'],
    ['Cobros de Inversiones', 'Otros Ing. No Operativos'],
    ['Compra de Propiedades,  Equipo', 'Otros Gtos No Operativos'],
    ['Inversiones (cedear/U$D)', 'Otros Gtos No Operativos'],
    ['Prestamos obtenidos (-)', 'Otros Ing. No Operativos'],
    ['Reembolso de Deudas', 'Gastos Financieros'],
    ['Refrigerios y gastos varios', 'Otros Gtos No Operativos'],
    ['Arreglo edilicio', 'Gastos Comercialización'],
    ['Art limpieza', 'Gastos Comercialización'],
    ['IIBB', 'Impuestos'],
    ['Comisiones por reparto', 'Gastos Comercialización'],
  ].forEach(function (a) { db.Glosario.push({ 'Concepto': a[0], 'Clasificación': a[1], 'Aplica IVA': 'No' }); });
  [['lea2026claude@gmail.com', 'admin'], ['notaripablo@gmail.com', 'socio'], ['danielaperagallo@gmail.com', 'socio']]
    .forEach(function (a) { db.Usuarios.push({ 'Email': a[0], 'Rol': a[1] }); });

  // ---- _row ----
  Object.keys(db).forEach(function (s) { db[s].forEach(function (r, i) { r._row = i + 2; }); });

  // ---- derivación (igual que el backend) ----
  function derive(sheet, rec) {
    var r = {}; Object.keys(rec).forEach(function (k) { if (k !== '_row') r[k] = rec[k]; });
    var p = parseFecha(r['Fecha']);
    if (r['Fecha']) r['Fecha'] = toIso(r['Fecha']);
    if (sheet === 'VENTAS') { if (p) { r['AÑO'] = p.y; r['MES'] = p.mo; } r['Totales'] = toNum(r['EFVO']) + toNum(r['Tarj o cta']) + toNum(r['MP']); }
    else if (sheet === 'MOVIMIENTOS') { if (p) { r['AÑO'] = p.y; r['MES'] = p.mo; } }
    else if (sheet === 'MP') { if (p) r['Mes'] = p.mo; r['Total'] = toNum(r['Cantidad']) * toNum(r['Precio unitario']); }
    else if (sheet === 'PROD') { if (p) r['Mes'] = p.mo; }
    return r;
  }
  function nextRow(arr) { return arr.reduce(function (m, r) { return Math.max(m, r._row || 0); }, 1) + 1; }
  function lists() { return { canales: clone(db.Listas), insumos: clone(db.ListaMP), productos: clone(db.ListaProd), glosario: clone(db.Glosario), usuarios: clone(db.Usuarios) }; }
  function byYear(rows, anio) { anio = Number(anio); return rows.filter(function (r) { return Number(r['AÑO']) === anio; }); }
  function byYearFecha(rows, anio) { return rows.filter(function (r) { return String(r['Fecha'] || '').slice(0, 4) === String(anio); }); }

  // ---- API mock ----
  window.Api = {
    bootstrap: function () { return delay({ user: { email: 'lea2026claude@gmail.com', rol: 'admin' }, lists: lists() }); },
    lists: function () { return delay(lists()); },
    list: function (s) { return delay(clone(db[s] || [])); },
    dashboard: function (anio) {
      return delay({ anio: Number(anio), ventas: clone(byYear(db.VENTAS, anio)), movimientos: clone(byYear(db.MOVIMIENTOS, anio)), mp: clone(byYearFecha(db.MP, anio)), prod: clone(byYearFecha(db.PROD, anio)) });
    },
    create: function (s, rec) { var row = derive(s, rec); row._row = nextRow(db[s]); db[s].push(row); return delay({ _row: row._row }); },
    update: function (s, rowNum, rec) {
      var idx = db[s].map(function (r) { return r._row; }).indexOf(Number(rowNum));
      if (idx >= 0) { var merged = Object.assign({}, db[s][idx], rec); var nr = derive(s, merged); nr._row = Number(rowNum); db[s][idx] = nr; }
      return delay({ _row: Number(rowNum) });
    },
    remove: function (s, rowNum) { db[s] = db[s].filter(function (r) { return r._row !== Number(rowNum); }); return delay({ _row: Number(rowNum), deleted: true }); }
  };

  // ---- Auth mock ----
  window.Auth.token = function () { return 'demo'; };
  window.Auth.profile = function () { return { email: 'lea2026claude@gmail.com', name: 'Demo Admin' }; };
  window.Auth.init = function () {};
  window.Auth.prompt = function () {};
  window.Auth.logout = function () {};
})();
