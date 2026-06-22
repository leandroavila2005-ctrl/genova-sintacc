/**
 * Cliente del API (GAS Web App). Devuelve data o lanza Error con el mensaje del backend.
 * GET para lecturas, POST (text/plain → sin preflight CORS) para escrituras.
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

  async function get(action, params) {
    var u = new URL(url());
    u.searchParams.set('action', action);
    u.searchParams.set('token', window.Auth.token() || '');
    Object.keys(params || {}).forEach(function (k) { u.searchParams.set(k, params[k]); });
    var res = await fetch(u.toString(), { method: 'GET' });
    return parse(await res.json());
  }

  async function post(action, payload) {
    var body = Object.assign({ action: action, token: window.Auth.token() || '' }, payload || {});
    var res = await fetch(url(), {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(body)
    });
    return parse(await res.json());
  }

  return {
    bootstrap: function () { return get('bootstrap'); },
    lists:     function () { return get('lists'); },
    list:      function (sheet) { return get('list', { sheet: sheet }); },
    dashboard: function (anio) { return get('dashboard', { anio: anio }); },
    create:    function (sheet, record) { return post('create', { sheet: sheet, record: record }); },
    update:    function (sheet, row, record) { return post('update', { sheet: sheet, row: row, record: record }); },
    remove:    function (sheet, row) { return post('delete', { sheet: sheet, row: row }); }
  };
})();
