import { createAdminApp } from "./admin.js";

if (window.self !== window.top) {
  document.body.replaceChildren(document.createTextNode("Откройте панель администратора в отдельной вкладке."));
} else {
  let storage = null;
  try { storage = window.sessionStorage; } catch { /* Browser storage may be disabled. */ }
  const app = createAdminApp({ document, storage, apiBase: "https://a.tlgrm.cx/austria-key-v2/admin-access/" });
  app.start();
}
