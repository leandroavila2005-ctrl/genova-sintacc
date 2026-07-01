/**
 * Génova Sin TACC · Inicialización de la Google Sheet
 * ----------------------------------------------------
 * Crea todas las solapas (datos + listas maestras) con sus headers y formato.
 *
 * USO:
 *   1. Abrí la Google Sheet que va a ser la base de datos.
 *   2. Extensiones → Apps Script, pegá este archivo (y los demás .gs del proyecto).
 *   3. Ejecutá `setupSpreadsheet` una vez (o usá el menú "Génova → Inicializar estructura").
 *
 * Es idempotente: crea las solapas que falten y reescribe headers/formato sin
 * borrar datos existentes. Para empezar de cero usá `resetSpreadsheet` (BORRA datos).
 */

/** Definición central de solapas. Reusada por el API (02_Api) para validar y mapear columnas. */
var SHEETS = {
  // ---- Solapas de datos ----
  VENTAS: {
    headers: ['Fecha', 'Lista/Canal', 'EFVO', 'Tarj o cta', 'MP', 'AÑO', 'MES', 'Totales', 'cat', 'Producto', 'Lote', 'Cantidad', 'Precio unit', 'Total venta', 'reqId']
  },
  MOVIMIENTOS: {
    headers: ['Fecha', 'Lista/Concepto', 'Observación', 'Monto', 'IVA', 'AÑO', 'MES', 'Clasif', 'reqId']
  },
  MP: {
    headers: ['Fecha', 'ID insumo', 'Nombre', 'Cantidad', 'Precio unitario', 'Total', 'Mes', 'Proveedor', 'Bulto cerrado', 'Lote', 'Fecha Vto', 'reqId']
  },
  MP_Saldos: {
    headers: ['AÑO', 'Mes', 'Saldo Final']
  },
  PROD: {
    headers: ['Fecha', 'Categoría', 'Artículo', 'Producto', 'Unidades', 'OBS1', 'Descuento', 'Mes', 'Lote', 'Fecha Vto', 'reqId']
  },

  // ---- Listas maestras / configuración ----
  Listas: {
    headers: ['Nombre', 'Categoría', 'Vigencia']
  },
  ListaMP: {
    headers: ['Código', 'Nombre', 'Categoría', 'Es producto']
  },
  ListaProd: {
    headers: ['Categoría', 'Artículo', 'Producto', 'Modelo de loteo', 'Kg por envase', 'Precio']
  },
  Glosario: {
    headers: ['Concepto', 'Clasificación', 'Aplica IVA']
  },
  Usuarios: {
    headers: ['Email', 'Rol']
  }
};

/** Enums fijos del negocio (también usados para dropdowns en la hoja). */
var ENUMS = {
  ventasCat: ['Minorista', 'Mayorista'],
  movClasif: [
    'Sueldos',
    'CF',
    'Gastos Administrativos',
    'Gastos Comercialización',
    'Gastos Financieros',
    'Otros Ing No Operativos',
    'Otros Gtos No Operativos'
  ],
  aplicaIva: ['Sí', 'No']
};

/** Orden de creación de solapas en la barra inferior. */
var SHEET_ORDER = ['VENTAS', 'MOVIMIENTOS', 'MP', 'MP_Saldos', 'PROD', 'Listas', 'ListaMP', 'ListaProd', 'Glosario', 'Usuarios'];

/** Menú al abrir la planilla. */
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('Génova')
    .addItem('Inicializar estructura', 'setupSpreadsheet')
    .addItem('Resetear (BORRA datos)', 'confirmReset')
    .addSeparator()
    .addItem('Ver ID de la planilla', 'showSpreadsheetId')
    .addToUi();
}

/**
 * Crea/actualiza todas las solapas. No borra filas de datos existentes.
 */
function setupSpreadsheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) throw new Error('No hay planilla activa. Ejecutá esto desde el editor de Apps Script ligado a la Sheet.');

  SHEET_ORDER.forEach(function (name, idx) {
    var def = SHEETS[name];
    var sheet = ss.getSheetByName(name);
    if (!sheet) {
      sheet = ss.insertSheet(name, idx);
    } else {
      ss.setActiveSheet(sheet);
      ss.moveActiveSheet(idx + 1); // ordenar (1-based)
    }
    writeHeaders_(sheet, def.headers);
  });

  applyValidations_(ss);
  seedDefaults_(ss);
  removeSheet1IfEmpty_(ss);

  SpreadsheetApp.getActive().toast('Estructura inicializada — ' + SHEET_ORDER.length + ' solapas listas.', 'Génova', 5);
}

/** Escribe la fila de headers con estilo (charcoal del sistema de diseño) y congela la primera fila. */
function writeHeaders_(sheet, headers) {
  var range = sheet.getRange(1, 1, 1, headers.length);
  range.setValues([headers]);
  range
    .setBackground('#1C1A19')   // --color-ink
    .setFontColor('#FAF6EE')
    .setFontWeight('bold')
    .setFontSize(10)
    .setVerticalAlignment('middle');
  sheet.setFrozenRows(1);
  sheet.setRowHeight(1, 32);
  // Auto-ancho aproximado
  for (var c = 1; c <= headers.length; c++) {
    sheet.autoResizeColumn(c);
  }
}

/** Dropdowns para los enums fijos (cat en VENTAS, Clasif en MOVIMIENTOS, Aplica IVA en Glosario). */
function applyValidations_(ss) {
  setColumnValidation_(ss.getSheetByName('VENTAS'), SHEETS.VENTAS.headers.indexOf('cat') + 1, ENUMS.ventasCat);
  setColumnValidation_(ss.getSheetByName('MOVIMIENTOS'), SHEETS.MOVIMIENTOS.headers.indexOf('Clasif') + 1, ENUMS.movClasif);
  setColumnValidation_(ss.getSheetByName('Glosario'), SHEETS.Glosario.headers.indexOf('Aplica IVA') + 1, ENUMS.aplicaIva);
}

function setColumnValidation_(sheet, col, values) {
  if (!sheet || col < 1) return;
  var rule = SpreadsheetApp.newDataValidation()
    .requireValueInList(values, true)
    .setAllowInvalid(false)
    .build();
  // Aplica desde la fila 2 hasta 5000 (margen amplio).
  sheet.getRange(2, col, 4999, 1).setDataValidation(rule);
}

/** Semillas mínimas no destructivas: clasificaciones en Glosario si está vacío. */
function seedDefaults_(ss) {
  var glos = ss.getSheetByName('Glosario');
  if (glos && glos.getLastRow() < 2) {
    var seed = [
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
      ['Comisiones por reparto', 'Gastos Comercialización']
    ];
    var rows = seed.map(function (a) { return [a[0], a[1], 'No']; });
    glos.getRange(2, 1, rows.length, 3).setValues(rows);
  }
  // Usuarios: se siembra sólo el admin. Los otros 2 socios se cargan
  // manualmente desde la pantalla de Configuración. Rol: admin / socio.
  var users = ss.getSheetByName('Usuarios');
  if (users && users.getLastRow() < 2) {
    users.getRange(2, 1, 3, 2).setValues([
      ['lea2026claude@gmail.com', 'admin'],
      ['notaripablo@gmail.com', 'socio'],
      ['danielaperagallo@gmail.com', 'socio']
    ]);
  }
}

/** Si quedó la "Hoja 1"/"Sheet1" vacía por defecto, la elimina. */
function removeSheet1IfEmpty_(ss) {
  ['Hoja 1', 'Hoja1', 'Sheet1'].forEach(function (n) {
    var s = ss.getSheetByName(n);
    if (s && s.getLastRow() === 0 && ss.getSheets().length > 1) {
      ss.deleteSheet(s);
    }
  });
}

/** Muestra el ID de la planilla (para pegarlo en la config del Web App / frontend). */
function showSpreadsheetId() {
  var id = SpreadsheetApp.getActiveSpreadsheet().getId();
  SpreadsheetApp.getUi().alert('Spreadsheet ID:\n\n' + id);
}

/** Confirmación antes de un reset destructivo. */
function confirmReset() {
  var ui = SpreadsheetApp.getUi();
  var resp = ui.alert('Resetear estructura', 'Esto BORRA todas las solapas y sus datos. ¿Continuar?', ui.ButtonSet.YES_NO);
  if (resp === ui.Button.YES) resetSpreadsheet();
}

/** Borra todas las solapas conocidas y las recrea vacías. DESTRUCTIVO. */
function resetSpreadsheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  // Crea una hoja temporal para no quedar sin ninguna.
  var tmp = ss.insertSheet('__tmp__');
  SHEET_ORDER.forEach(function (name) {
    var s = ss.getSheetByName(name);
    if (s) ss.deleteSheet(s);
  });
  setupSpreadsheet();
  ss.deleteSheet(ss.getSheetByName('__tmp__') || tmp);
}
