/**
 * Autenticación con Google Identity Services (ID token / JWT).
 * El token se manda al backend en cada request; acá sólo se decodifica
 * para mostrar nombre/inicial (no es fuente de verdad: la valida el GAS).
 */
window.Auth = (function () {
  var _token = null, _profile = null, _onCredential = null;

  function decode(jwt) {
    try {
      var p = jwt.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
      return JSON.parse(decodeURIComponent(escape(atob(p))));
    } catch (e) { return {}; }
  }

  function handle(resp) {
    _token = resp.credential;
    _profile = decode(_token);
    try { sessionStorage.setItem('gv_token', _token); } catch (e) {}
    if (_onCredential) _onCredential(_profile);
  }

  function init(onCredential) {
    _onCredential = onCredential;
    var cid = window.GENOVA_CONFIG.OAUTH_CLIENT_ID;
    if (!cid || cid.indexOf('PEGAR_AQUI') === 0) throw new Error('Falta configurar OAUTH_CLIENT_ID en js/config.js');
    google.accounts.id.initialize({
      client_id: cid,
      callback: handle,
      auto_select: true,
      cancel_on_tap_outside: false
    });
  }

  /** Dispara One Tap y, como respaldo visible, renderiza el botón oficial. */
  function prompt(fallbackEl) {
    google.accounts.id.prompt(function (n) {
      if (fallbackEl && (n.isNotDisplayed() || n.isSkippedMoment())) {
        fallbackEl.innerHTML = '';
        google.accounts.id.renderButton(fallbackEl, {
          theme: 'filled_black', size: 'large', text: 'continue_with', shape: 'pill', logo_alignment: 'left'
        });
      }
    });
  }

  function logout() {
    _token = null; _profile = null;
    try { sessionStorage.removeItem('gv_token'); } catch (e) {}
    try { google.accounts.id.disableAutoSelect(); } catch (e) {}
  }

  return {
    init: init,
    prompt: prompt,
    logout: logout,
    token: function () { return _token; },
    profile: function () { return _profile; }
  };
})();
