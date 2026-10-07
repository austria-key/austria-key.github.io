import { createAdminApp } from "./admin.js";

if (window.self !== window.top) {
  document.body.replaceChildren(document.createTextNode("Откройте панель администратора в отдельной вкладке."));
} else {
  const app = createAdminApp({ document, apiBase: "https://a.tlgrm.cx/austria-key-v2/admin-access/" });
  app.start();
}
