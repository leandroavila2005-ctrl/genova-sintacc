/**
 * Génova Sin TACC · Configuración del frontend
 * Completar ambos valores antes de usar la app.
 */
window.GENOVA_CONFIG = {
  // Modo demo: true = sin login ni backend, datos de muestra en memoria.
  // ⚠️ Poné en false antes de subir a producción.
  DEMO_MODE: false,

  // URL /exec de la implementación del Web App (Apps Script).
  API_URL: 'https://script.google.com/macros/s/AKfycbxMR_a9rwV9L7VzKl9_qH89Zz2blP-dJu_fmIqG6-MOxAPxfUr53t0jr6taarELqoX7/exec',

  // OAuth 2.0 Client ID (tipo "Aplicación web") de Google Cloud Console.
  // Debe ser el MISMO que en 02_Api.gs (CONFIG.OAUTH_CLIENT_ID).
  OAUTH_CLIENT_ID: '1840041202-g459j09b8qoefneva97964nteda7eiuo.apps.googleusercontent.com'
};
