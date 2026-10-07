import { createAdminApp } from "./admin.js";

if (window.self !== window.top) {
  document.body.replaceChildren(document.createTextNode("Откройте панель администратора в отдельной вкладке."));
} else {
  let storage = null;
  try { storage = window.sessionStorage; } catch { /* Browser storage may be disabled. */ }
  let preferenceStorage = null;
  try { preferenceStorage = window.localStorage; } catch { /* The public request number can be entered manually. */ }
  const app = createAdminApp({ document, storage, preferenceStorage, apiBase: "https://a.tlgrm.cx/austria-key-v2/admin-access/" });
  app.start();
}
