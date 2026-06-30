/**
 * Cliente del API (GAS Web App). Devuelve data o lanza Error con el mensaje del backend.
 * Todo por GET: cross-origin con Apps Script, el POST termina en una redirección que el
 * navegador recibe como HTML. El GET sí devuelve JSON de forma confiable, así que las
 * escrituras también van por GET (el record viaja como JSON en la query; el backend lo parsea).
 */
window.Api = (function () {
  function url() {
    var u = window.GENOVA_CONFIG.API_URL;
    if (!u || u.indexOf('PEGAR_URL') === 0) throw new Error('Falta configurar API_URL en js/config.js');
    return u;
  }

  function parse(j) {
    if (!j || j.ok === false) throw new Error((j && j.error) || 'Error del servidor');
    return j.data;
  }

  async function call(action, params) {
    var u = new URL(url());
    u.searchParams.set('action', action);
    u.searchParams.set('token', window.Auth.token() || '');
    Object.keys(params || {}).forEach(function (k) {
      var v = params[k];
      if (v === undefined || v === null) return;
      u.searchParams.set(k, (typeof v === 'object') ? JSON.stringify(v) : v);
    });
    u.searchParams.set('_', Date.now()); // anti-caché
    var res = await fetch(u.toString(), { method: 'GET' });
    return parse(await res.json());
  }

  return {
    bootstrap: function () { return call('bootstrap'); },
    lists:     function () { return call('lists'); },
    list:      function (sheet) { return call('list', { sheet: sheet }); },
    dashboard: function (anio) { return call('dashboard', { anio: anio }); },
    create:    function (sheet, record) {
      // reqId único: si un mismo create se envía dos veces, el backend lo descarta (no duplica).
      var rec = Object.assign({ reqId: Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8) }, record || {});
      return call('create', { sheet: sheet, record: rec });
    },
    update:    function (sheet, row, record) { return call('update', { sheet: sheet, row: row, record: record }); },
    remove:    function (sheet, row) { return call('delete', { sheet: sheet, row: row }); }
  };
})();
