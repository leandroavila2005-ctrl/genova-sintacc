/**
 * Génova Sin TACC · API (Web App)
 * --------------------------------
 * Backend JSON sobre Google Sheets. Autenticación por Google ID token (GIS).
 *
 * DEPLOY:
 *   Implementar → Nueva implementación → Tipo: Aplicación web
 *     - Ejecutar como: Yo (el admin)
 *     - Quién tiene acceso: Cualquiera
 *   Copiar la URL /exec → es API_URL en el frontend (js/config.js).
 *
 * AUTH:
 *   El frontend obtiene un ID token con Google Identity Services y lo manda en
 *   cada request (query `token` en GET, campo `token` en el body JSON en POST).
 *   El GAS lo verifica contra Google, extrae el email y lo valida contra `Usuarios`.
 *
 * CONFIG REQUERIDA: completar OAUTH_CLIENT_ID con el Client ID web de Google Cloud.
 */

var CONFIG = {
  // OAuth 2.0 Client ID (tipo "Aplicación web") de Google Cloud Console.
  // Debe coincidir con el usado por GIS en el frontend.
  OAUTH_CLIENT_ID: 'PEGAR_AQUI.apps.googleusercontent.com',

  // Solapas donde se permite escribir.
  DATA_SHEETS:  ['VENTAS', 'MOVIMIENTOS', 'MP', 'PROD', 'MP_Saldos'],
  CONFIG_SHEETS: ['Listas', 'ListaMP', 'ListaProd', 'Glosario', 'Usuarios'] // sólo admin
};

/* ============================ ENTRY POINTS ============================ */

function doGet(e) {
  return handle_(e, (e.parameter && e.parameter.action) || '', e.parameter || {});
}

function doPost(e) {
  var body = {};
  try { body = JSON.parse((e.postData && e.postData.contents) || '{}'); } catch (err) { body = {}; }
  return handle_(e, body.action || '', body);
}

/** Router central. Devuelve siempre JSON { ok, data } | { ok:false, error }. */
function handle_(e, action, params) {
  try {
    // Las escrituras llegan por GET (cross-origin confiable): el record viene como JSON string.
    if (typeof params.record === 'string') { try { params.record = JSON.parse(params.record); } catch (e2) {} }
    var user = authenticate_(params.token);

    switch (action) {
      // ---- lectura ----
      case 'bootstrap':  return json_(true, bootstrap_(user));
      case 'lists':      return json_(true, getMasterLists_());
      case 'list':       return json_(true, listSheet_(requireSheet_(params.sheet)));
      case 'dashboard':  return json_(true, getDashboard_(Number(params.anio)));

      // ---- escritura ----
      case 'create':     return json_(true, createRecord_(user, params.sheet, params.record));
      case 'update':     return json_(true, updateRecord_(user, params.sheet, Number(params.row), params.record));
      case 'delete':     return json_(true, deleteRecord_(user, params.sheet, Number(params.row)));

      default: throw new Error('Acción desconocida: ' + action);
    }
  } catch (err) {
    return json_(false, null, err.message || String(err));
  }
}

/* ============================ AUTENTICACIÓN ============================ */

/**
 * Verifica el ID token contra Google, valida el email contra `Usuarios`.
 * Devuelve { email, rol }. Lanza error si no es válido o no está autorizado.
 */
function authenticate_(token) {
  if (!token) throw new Error('No autenticado: falta token.');

  var resp = UrlFetchApp.fetch('https://oauth2.googleapis.com/tokeninfo?id_token=' + encodeURIComponent(token), {
    muteHttpExceptions: true
  });
  if (resp.getResponseCode() !== 200) throw new Error('Token inválido.');

  var info = JSON.parse(resp.getContentText());
  if (info.aud !== CONFIG.OAUTH_CLIENT_ID) throw new Error('Token de otra aplicación.');
  if (info.email_verified !== 'true' && info.email_verified !== true) throw new Error('Email no verificado.');

  var email = String(info.email || '').toLowerCase().trim();
  var rol = findUserRole_(email);
  if (!rol) throw new Error('ACCESO_DENEGADO');

  return { email: email, rol: rol };
}

/** Busca el rol del email en la solapa Usuarios (case-insensitive). null si no está. */
function findUserRole_(email) {
  var rows = listSheet_('Usuarios');
  for (var i = 0; i < rows.length; i++) {
    if (String(rows[i]['Email'] || '').toLowerCase().trim() === email) {
      return String(rows[i]['Rol'] || 'socio').toLowerCase().trim();
    }
  }
  return null;
}

function requireAdmin_(user) {
  if (user.rol !== 'admin') throw new Error('Requiere rol admin.');
}

/* ============================ LECTURA ============================ */

/** Datos de arranque del frontend: identidad + listas maestras. */
function bootstrap_(user) {
  return { user: user, lists: getMasterLists_() };
}

/** Listas maestras para poblar los formularios dinámicamente. */
function getMasterLists_() {
  return {
    canales:   listSheet_('Listas'),     // Nombre | Categoría | Vigencia
    insumos:   listSheet_('ListaMP'),    // Código | Nombre | Categoría | Es producto
    productos: listSheet_('ListaProd'),  // Categoría | Artículo | Producto
    glosario:  listSheet_('Glosario'),   // Concepto | Clasificación | Aplica IVA
    usuarios:  listSheet_('Usuarios')    // Email | Rol
  };
}

/**
 * Lee una solapa como array de objetos {header: valor, _row: n}.
 * _row es el número de fila real (para update/delete).
 */
function listSheet_(name) {
  var sheet = ss_().getSheetByName(name);
  if (!sheet) throw new Error('Solapa inexistente: ' + name);
  var lastRow = sheet.getLastRow();
  var lastCol = sheet.getLastColumn();
  if (lastRow < 2) return [];

  var headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  var values = sheet.getRange(2, 1, lastRow - 1, lastCol).getValues();

  return values.map(function (row, idx) {
    var obj = { _row: idx + 2 };
    headers.forEach(function (h, c) {
      if (h !== '') obj[h] = normalizeCell_(row[c]);
    });
    return obj;
  }).filter(function (o) {
    // descarta filas totalmente vacías
    return Object.keys(o).some(function (k) { return k !== '_row' && o[k] !== '' && o[k] !== null; });
  });
}

/** Devuelve los datasets de un año para que el dashboard calcule KPIs en JS. */
function getDashboard_(anio) {
  var y = anio || (new Date()).getFullYear();
  var byYear = function (rows) {
    return rows.filter(function (r) { return Number(r['AÑO']) === y; });
  };
  return {
    anio: y,
    ventas:      byYear(listSheet_('VENTAS')),
    movimientos: byYear(listSheet_('MOVIMIENTOS')),
    mp:          listSheet_('MP').filter(function (r) { return yearOf_(r['Fecha']) === y; }),
    prod:        listSheet_('PROD').filter(function (r) { return yearOf_(r['Fecha']) === y; })
  };
}

/* ============================ ESCRITURA (CRUD) ============================ */

function createRecord_(user, sheetName, record) {
  var sheet = checkWritable_(user, sheetName);
  var headers = headerRow_(sheet);
  var row = deriveFields_(sheetName, record || {});
  var values = headers.map(function (h) { return h in row ? row[h] : ''; });
  // Idempotencia: si llega dos veces el mismo reqId (doble envío), no duplica.
  if (record && record.reqId && headers.indexOf('reqId') >= 0 && sheet.getLastRow() >= 2) { var _ids = sheet.getRange(2, headers.indexOf('reqId') + 1, sheet.getLastRow() - 1, 1).getValues(); for (var _i = 0; _i < _ids.length; _i++) { if (String(_ids[_i][0]) === String(record.reqId)) return { _row: _i + 2, dup: true }; } }
  sheet.appendRow(values);
  return { _row: sheet.getLastRow() };
}

function updateRecord_(user, sheetName, rowNum, record) {
  var sheet = checkWritable_(user, sheetName);
  if (!rowNum || rowNum < 2) throw new Error('Fila inválida.');
  var headers = headerRow_(sheet);
  var row = deriveFields_(sheetName, record || {});
  var current = sheet.getRange(rowNum, 1, 1, headers.length).getValues()[0];
  var values = headers.map(function (h, c) { return h in row ? row[h] : current[c]; });
  sheet.getRange(rowNum, 1, 1, headers.length).setValues([values]);
  return { _row: rowNum };
}

function deleteRecord_(user, sheetName, rowNum) {
  var sheet = checkWritable_(user, sheetName);
  if (!rowNum || rowNum < 2) throw new Error('Fila inválida.');
  sheet.deleteRow(rowNum);
  return { _row: rowNum, deleted: true };
}

/** Valida permiso de escritura y devuelve la hoja. Config sheets sólo admin. */
function checkWritable_(user, sheetName) {
  if (CONFIG.CONFIG_SHEETS.indexOf(sheetName) >= 0) {
    requireAdmin_(user);
  } else if (CONFIG.DATA_SHEETS.indexOf(sheetName) < 0) {
    throw new Error('Solapa no escribible: ' + sheetName);
  }
  var sheet = ss_().getSheetByName(sheetName);
  if (!sheet) throw new Error('Solapa inexistente: ' + sheetName);
  return sheet;
}

/**
 * Calcula campos derivados según la solapa antes de escribir.
 * Mantiene consistentes AÑO/MES/Totales/Total sin confiar en el cliente.
 */
function deriveFields_(sheetName, record) {
  var r = {};
  // copia campos provistos
  Object.keys(record).forEach(function (k) { if (k !== '_row') r[k] = record[k]; });

  if (sheetName === 'VENTAS') {
    var f = parseDate_(r['Fecha']);
    if (f) { r['AÑO'] = f.getFullYear(); r['MES'] = f.getMonth() + 1; }
    r['Totales'] = num_(r['EFVO']) + num_(r['Tarj o cta']) + num_(r['MP']);
  } else if (sheetName === 'MOVIMIENTOS') {
    var fm = parseDate_(r['Fecha']);
    if (fm) { r['AÑO'] = fm.getFullYear(); r['MES'] = fm.getMonth() + 1; }
  } else if (sheetName === 'MP') {
    var fmp = parseDate_(r['Fecha']);
    if (fmp) r['Mes'] = fmp.getMonth() + 1;
    r['Total'] = num_(r['Cantidad']) * num_(r['Precio unitario']);
  } else if (sheetName === 'PROD') {
    var fp = parseDate_(r['Fecha']);
    if (fp) r['Mes'] = fp.getMonth() + 1;
  }
  return r;
}

/* ============================ HELPERS ============================ */

function ss_() {
  var s = SpreadsheetApp.getActiveSpreadsheet();
  if (!s) throw new Error('Sin planilla activa.');
  return s;
}

function headerRow_(sheet) {
  return sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
}

function requireSheet_(name) {
  if (!name) throw new Error('Falta parámetro sheet.');
  return name;
}

function num_(v) {
  if (v === '' || v === null || v === undefined) return 0;
  var n = Number(String(v).replace(/[^0-9.\-]/g, ''));
  return isNaN(n) ? 0 : n;
}

function yearOf_(v) {
  var d = parseDate_(v);
  return d ? d.getFullYear() : null;
}

/** Acepta Date, 'YYYY-MM-DD' o 'DD/MM/YYYY'. */
function parseDate_(v) {
  if (!v) return null;
  if (Object.prototype.toString.call(v) === '[object Date]') return v;
  var s = String(v).trim();
  var m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (m) return new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]));
  var d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

/** Convierte Date a ISO 'YYYY-MM-DD' para el frontend; deja otros valores tal cual. */
function normalizeCell_(v) {
  if (Object.prototype.toString.call(v) === '[object Date]') {
    var mm = ('0' + (v.getMonth() + 1)).slice(-2);
    var dd = ('0' + v.getDate()).slice(-2);
    return v.getFullYear() + '-' + mm + '-' + dd;
  }
  return v;
}

function json_(ok, data, error) {
  var payload = ok ? { ok: true, data: data } : { ok: false, error: error };
  return ContentService
    .createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}
