// Lucide icon geometry is distributed under the ISC license (see LICENSE-lucide.txt).
const icons = {
  download: ["M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4", "m7 10 5 5 5-5", "M12 15V3"],
  copy: ["M9 9h13v13H9z", "M5 15H2V2h13v3"],
  share: ["M12 16V3", "m7 8 5-5 5 5", "M5 13v8h14v-8"],
  view: ["M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7", "M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6"],
  revoke: ["M3 6h18", "M19 6v14H5V6", "M8 6V3h8v3", "M10 10v6M14 10v6"],
  approve: ["m20 6-11 11-5-5"], reject: ["m18 6-12 12", "M6 6l12 12"],
};
const labels = { pending: "Не использован", active: "Активирован", revoked: "Отозван" };
const errorLabels = {
  PASSKEY_REQUIRED: "Сеанс завершён. Войдите с одобренным Passkey.",
  PASSKEY_NOT_APPROVED: "Этот Passkey ещё не одобрен владельцем или его права отозваны.",
  PASSKEY_VERIFICATION_FAILED: "Не удалось подтвердить Passkey. Начните заново.",
  OWNER_SETUP_REQUIRED: "Владелец ещё не завершил первоначальную настройку.",
  BOOTSTRAP_INVALID: "Код первоначальной настройки недействителен или уже использован.",
  CHALLENGE_EXPIRED: "Время подтверждения истекло. Начните заново.",
  OWNER_REQUIRED: "Это действие доступно только владельцу.",
  GATE_CAPACITY: "Нет свободных мест для этого количества QR.",
  INVALID_APARTMENT: "Введите номер квартиры, например 60/2.",
  QUANTITY_1_TO_50: "Допустимо от 1 до 50 QR в одном пакете.",
  CSRF_REQUIRED: "Сеанс недействителен. Завершите его и войдите снова.",
  SESSION_REVOKED: "Сеанс завершён: права этого Passkey отозваны.",
  LAST_OWNER_PASSKEY: "Нельзя отозвать последний действующий Passkey владельца.",
  OWNER_CANNOT_BE_DISABLED: "Нельзя отключить владельца.",
  FINGERPRINT_MISMATCH: "Отпечаток изменился. Обновите список запросов.",
  NAME_AND_DEVICE_REQUIRED: "Укажите имя и название устройства.",
  DOWNLOAD_UNAVAILABLE: "Скачивание недоступно: QR отозван или исходный файл не сохранён.",
  PENDING_LIMIT: "Слишком много ожидающих запросов. Обратитесь к владельцу.",
  PASSKEY_ALREADY_REGISTERED: "Этот Passkey уже зарегистрирован.",
  REQUEST_NOT_FOUND: "Запрос уже обработан. Обновите список.",
  REVOCATION_CONFIRMATION_MISMATCH: "Сведения об отзыве изменились. Обновите историю.",
  TRY_LATER: "Слишком много запросов. Повторите позже.",
  SESSION_CHANGED: "Сеанс изменился. Повторите действие после входа.",
  INVALID_RESPONSE: "Сервер вернул некорректный ответ. Повторите соединение.",
};

export class ApiError extends Error {
  constructor(code, status = 0) { super(code); this.code = code; this.status = status; }
}

export function decodeBase64url(value) {
  if (typeof value !== "string" || !/^[A-Za-z0-9_-]+$/.test(value)) throw new ApiError("INVALID_RESPONSE");
  const text = value.replace(/-/g, "+").replace(/_/g, "/");
  return Uint8Array.from(atob(text + "=".repeat((4 - text.length % 4) % 4)), (c) => c.charCodeAt(0));
}

export function encodeBase64url(value) {
  return btoa(String.fromCharCode(...new Uint8Array(value))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function credentialOptions(value, registration = false) {
  const options = { ...value, challenge: decodeBase64url(value.challenge) };
  if (registration) options.user = { ...value.user, id: decodeBase64url(value.user.id) };
  for (const name of ["allowCredentials", "excludeCredentials"]) {
    if (value[name]) options[name] = value[name].map((item) => ({ ...item, id: decodeBase64url(item.id) }));
  }
  return options;
}

export function serializeCredential(credential) {
  if (!credential || credential.type !== "public-key") throw new ApiError("PASSKEY_VERIFICATION_FAILED");
  const response = { clientDataJSON: encodeBase64url(credential.response.clientDataJSON) };
  for (const name of ["attestationObject", "authenticatorData", "signature", "userHandle"]) {
    if (credential.response[name] != null) response[name] = encodeBase64url(credential.response[name]);
  }
  if (credential.response.getTransports) response.transports = credential.response.getTransports();
  return { id: credential.id, rawId: encodeBase64url(credential.rawId), type: credential.type, response,
    clientExtensionResults: credential.getClientExtensionResults?.() ?? {},
    authenticatorAttachment: credential.authenticatorAttachment ?? null };
}

export function downloadFilename(header, fallback) {
  const extended = header?.match(/filename\*\s*=\s*UTF-8''([^;]+)/i);
  const quoted = header?.match(/filename\s*=\s*"([^"]*)"/i);
  const plain = header?.match(/filename\s*=\s*([^;]+)/i);
  let name = quoted?.[1] ?? plain?.[1]?.trim() ?? fallback;
  if (extended) { try { name = decodeURIComponent(extended[1]); } catch { name = fallback; } }
  name = name.replace(/[\/\\\x00-\x1f\x7f]/g, "_").replace(/^\.+/, "").slice(0, 180);
  return name || fallback;
}

export function sharePreparedFile(delivery, file) {
  if (typeof delivery?.share !== "function") throw new ApiError("SHARE_UNAVAILABLE");
  // Some vendor browsers expose share() without a working canShare(). Let the
  // native API validate the file; files-only avoids silently sharing empty text.
  return delivery.share({ files: [file] });
}

export function collageLayout(sizes) {
  if (!sizes.length || sizes.length > 50 || sizes.some(({ width, height }) => !Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 || width > 4096 || height > 4096)) throw new ApiError("INVALID_RESPONSE");
  const columns = Math.ceil(Math.sqrt(sizes.length)), rows = Math.ceil(sizes.length / columns);
  const width = Math.max(...sizes.map((size) => size.width)), height = Math.max(...sizes.map((size) => size.height));
  // Bound canvas memory on phones; power-of-two scaling keeps QR modules crisp.
  const divisor = 2 ** Math.max(0, Math.ceil(Math.log2(Math.sqrt(columns * rows * (width + 16) * (height + 16) / 14000000))));
  const tileWidth = Math.ceil(width / divisor) + 16, tileHeight = Math.ceil(height / divisor) + 16;
  return { columns, rows, divisor, tileWidth, tileHeight, width: columns * tileWidth, height: rows * tileHeight };
}

export async function qrCollage(blobs, doc) {
  async function withImage(blob, action) {
    const url = URL.createObjectURL(blob), image = doc.createElement("img");
    try { image.src = url; await image.decode(); return action(image); }
    finally { image.src = ""; URL.revokeObjectURL(url); }
  }
  const sizes = [];
  for (const blob of blobs) sizes.push(await withImage(blob, (image) => ({ width: image.naturalWidth, height: image.naturalHeight })));
  const layout = collageLayout(sizes), canvas = doc.createElement("canvas"); canvas.width = layout.width; canvas.height = layout.height;
  try {
    const context = canvas.getContext("2d"); if (!context) throw new ApiError("INVALID_RESPONSE");
    context.fillStyle = "white"; context.fillRect(0, 0, canvas.width, canvas.height); context.imageSmoothingEnabled = false;
    for (let index = 0; index < blobs.length; index++) await withImage(blobs[index], (image) => context.drawImage(image, (index % layout.columns) * layout.tileWidth + 8, Math.floor(index / layout.columns) * layout.tileHeight + 8, image.naturalWidth / layout.divisor, image.naturalHeight / layout.divisor));
    return await new Promise((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(new ApiError("INVALID_RESPONSE")), "image/png"));
  } finally { canvas.width = canvas.height = 0; }
}

export class SessionClient {
  #session = null;
  #epoch = 0;
  #timer = null;
  constructor({ apiBase, fetchImpl = globalThis.fetch.bind(globalThis), onExpired = () => {}, now = () => Date.now(), timer = globalThis, storage = null }) {
    this.base = new URL(apiBase); this.fetchImpl = fetchImpl; this.onExpired = onExpired; this.now = now; this.timer = timer;
    this.storage = storage; this.storageKey = `austria-key-admin-session:${this.base.href}`;
  }
  get generation() { return this.#epoch; }
  get state() { return { authenticated: this.#session?.authenticated === true, principal: this.#session?.principal ? { ...this.#session.principal } : null }; }
  get available() { return this.#session !== null; }
  clear() { this.#epoch++; this.timer.clearTimeout(this.#timer); this.#timer = null; this.#session = null; try { this.storage?.removeItem(this.storageKey); } catch { /* Storage may be disabled. */ } }
  install(value) {
    if (!value || typeof value.session_token !== "string" || value.session_token.length < 32 ||
        typeof value.csrf_token !== "string" || value.csrf_token.length < 32 ||
        !Number.isFinite(value.expires_at) || value.expires_at * 1000 <= this.now() ||
        value.rp_id !== "austria-key.github.io" || value.webauthn_origin !== "https://austria-key.github.io" ||
        typeof value.authenticated !== "boolean" || (value.authenticated && (!value.principal ||
          !["owner", "admin"].includes(value.principal.role) || typeof value.principal.id !== "string" || typeof value.principal.name !== "string"))) {
      throw new ApiError("INVALID_RESPONSE");
    }
    this.clear();
    this.#session = { ...value, principal: value.authenticated ? { ...value.principal } : null };
    if (value.authenticated) { try { this.storage?.setItem(this.storageKey, JSON.stringify(this.#session)); } catch { /* Login still works without persistence. */ } }
    const generation = this.#epoch;
    this.#timer = this.timer.setTimeout(() => {
      if (generation !== this.#epoch) return;
      this.clear(); this.onExpired(new ApiError("PASSKEY_REQUIRED", 401));
    }, Math.min(value.expires_at * 1000 - this.now(), 2147483647));
  }
  async guest() {
    const generation = this.#epoch;
    const value = await this.request("auth/session", { body: {}, anonymous: true });
    if (generation !== this.#epoch) throw new ApiError("SESSION_CHANGED");
    this.install(value); return this.state;
  }
  async resume() {
    let saved;
    try { saved = JSON.parse(this.storage?.getItem(this.storageKey) ?? "null"); }
    catch { this.clear(); }
    if (!saved?.authenticated) return this.guest();
    try { this.install(saved); }
    catch { this.clear(); return this.guest(); }
    // Never expose a stored role until the server has confirmed this session.
    this.#session.authenticated = false; this.#session.principal = null;
    const generation = this.#epoch;
    try {
      const state = await this.request("state", { notifyExpired: false });
      this.install({ ...state, session_token: saved.session_token });
      return this.state;
    } catch (error) {
      if (error.status === 401) return this.guest();
      if (generation === this.#epoch) { this.timer.clearTimeout(this.#timer); this.#timer = null; this.#session = null; }
      throw error;
    }
  }
  async #bounded(operation) {
    const controller = new AbortController();
    let deadline;
    const timeout = new Promise((_, reject) => {
      deadline = this.timer.setTimeout(() => { controller.abort(); reject(new ApiError("NETWORK_ERROR")); }, 20000);
    });
    try { return await Promise.race([operation(controller.signal), timeout]); }
    finally { this.timer.clearTimeout(deadline); }
  }
  async request(path, { body, anonymous = false, blob = false, notifyExpired = true } = {}) {
    const url = new URL(path, this.base);
    if (url.origin !== this.base.origin || !url.pathname.startsWith(this.base.pathname) || url.hash) throw new ApiError("INVALID_RESPONSE");
    const generation = this.#epoch;
    const headers = { Accept: blob ? "image/png, application/zip" : "application/json" };
    if (!anonymous) {
      if (!this.#session || this.#session.expires_at * 1000 <= this.now()) {
        this.clear(); this.onExpired(new ApiError("PASSKEY_REQUIRED", 401)); throw new ApiError("PASSKEY_REQUIRED", 401);
      }
      headers.Authorization = `Bearer ${this.#session.session_token}`;
      if (body !== undefined) headers["X-CSRF-Token"] = this.#session.csrf_token;
    }
    if (body !== undefined) headers["Content-Type"] = "application/json";
    return this.#bounded(async (signal) => {
    let response;
    try {
      response = await this.fetchImpl(url.href, { method: body === undefined ? "GET" : "POST", headers,
        body: body === undefined ? undefined : JSON.stringify(body), credentials: "omit", cache: "no-store", redirect: "error", referrerPolicy: "no-referrer", signal });
    } catch {
      if (generation !== this.#epoch) throw new ApiError("SESSION_CHANGED");
      throw new ApiError("NETWORK_ERROR");
    }
    if (signal.aborted) throw new ApiError("NETWORK_ERROR");
    if (generation !== this.#epoch) throw new ApiError("SESSION_CHANGED");
    if (!response.ok) {
      let code; try { code = (await response.json()).error; } catch { /* Do not show server HTML or arbitrary messages. */ }
      if (signal.aborted) throw new ApiError("NETWORK_ERROR");
      if (generation !== this.#epoch) throw new ApiError("SESSION_CHANGED");
      const error = new ApiError(typeof code === "string" ? code : "REQUEST_FAILED", response.status);
      if (response.status === 401 && !anonymous) { this.clear(); if (notifyExpired) this.onExpired(error); }
      throw error;
    }
    if (blob) {
      const contentType = response.headers.get("Content-Type")?.split(";")[0];
      if (!["image/png", "application/zip"].includes(contentType)) throw new ApiError("INVALID_RESPONSE");
      const data = await response.blob();
      if (signal.aborted) throw new ApiError("NETWORK_ERROR");
      if (generation !== this.#epoch) throw new ApiError("SESSION_CHANGED");
      return { data, disposition: response.headers.get("Content-Disposition") };
    }
    let value; try { value = await response.json(); } catch { throw new ApiError("INVALID_RESPONSE"); }
    if (signal.aborted) throw new ApiError("NETWORK_ERROR");
    if (generation !== this.#epoch) throw new ApiError("SESSION_CHANGED");
    return value;
    });
  }
}

export function requestNumberPreference(storage, apiBase) {
  const key = `austria-key-admin-request:${new URL(apiBase).href}`;
  return {
    read() {
      try { const value = storage?.getItem(key); const number = Number(value);
        return value && /^[1-9][0-9]*$/.test(value) && Number.isSafeInteger(number) ? String(number) : "";
      } catch { return ""; }
    },
    save(value) {
      try { const number = Number(value);
        if (Number.isSafeInteger(number) && number > 0) storage?.setItem(key, String(number));
        else storage?.removeItem(key);
      } catch { /* Remembering a public request number is optional. */ }
    },
  };
}

export function createAdminApp({ document: doc, apiBase, fetchImpl, credentials = globalThis.navigator?.credentials, delivery = globalThis.navigator, clipboardItem = globalThis.ClipboardItem, saveBlob, timer, now, storage = null, preferenceStorage = null }) {
  const $ = (id) => doc.getElementById(id);
  const requestPreference = requestNumberPreference(preferenceStorage, apiBase);
  $("login-request-number").value = requestPreference.read();
  let busy = false, historySequence = 0, accountSequence = 0, destroyed = false;
  let deliveryKeys = [], previewUrls = [];
  const client = new SessionClient({ apiBase, fetchImpl, timer, now, storage, onExpired: (error) => { resetPrivate(); message(errorText(error), true); connect(false); } });
  const el = (tag, value, className) => { const node = doc.createElement(tag); if (value != null) node.textContent = value; if (className) node.className = className; return node; };
  function icon(name) {
    const svg = doc.createElementNS("http://www.w3.org/2000/svg", "svg"); svg.setAttribute("viewBox", "0 0 24 24"); svg.setAttribute("aria-hidden", "true");
    for (const value of icons[name]) { const path = doc.createElementNS(svg.namespaceURI, "path"); path.setAttribute("d", value); svg.append(path); }
    return svg;
  }
  function iconButton(name, title, handler, danger = false) {
    const button = el("button", null, `icon-button${danger ? " danger" : ""}`); button.type = "button"; button.title = title; button.setAttribute("aria-label", title);
    button.append(icon(name)); button.addEventListener("click", handler); return button;
  }
  function errorText(error, mutation = false) {
    if (error?.name === "NotAllowedError" || error?.name === "AbortError") return "Подтверждение Passkey отменено или время ожидания истекло. Можно начать заново.";
    if (error?.code === "NETWORK_ERROR") return mutation ? "Ответ не получен. Проверьте историю перед повторным действием." : "Нет соединения с сервером. Повторите соединение.";
    if (error?.name === "SecurityError") return "Passkey недоступен на этом адресе. Откройте официальную панель администратора.";
    if (error?.name === "NotSupportedError") return "На этом устройстве или в этом браузере недоступно создание такого Passkey. Попробуйте другой браузер с поддержкой Passkey или другое устройство. Пароль вместо Passkey не требуется.";
    if (error?.name === "InvalidStateError") return "Этот ключ уже существует на устройстве. Попробуйте войти с Passkey или выбрать другой ключ.";
    return errorLabels[error?.code] ?? (error?.status === 429 ? "Слишком много запросов. Повторите позже." : "Не удалось выполнить действие. Обновите список или повторите вход.");
  }
  function message(text, error = false) { $("message").textContent = text; $("message").classList.toggle("error", error); $("message").hidden = !text; }
  function updateControls() {
    const { authenticated, principal } = client.state;
    $("auth-view").hidden = authenticated; $("admin-view").hidden = !authenticated;
    $("logout").hidden = !authenticated; $("extra-passkey").hidden = !authenticated; $("identity").hidden = !authenticated;
    $("identity").textContent = authenticated ? `${principal.name} · ${principal.role === "owner" ? "Владелец" : "Администратор"}` : "";
    $("tab-accounts").hidden = !authenticated || principal.role !== "owner";
    for (const id of ["login", "show-register", "extra-passkey", "register", "issue", "logout"]) $(id).disabled = busy || !client.available;
    doc.querySelectorAll("#history button, #requests button, #requests select, #principals button, #batch-result button").forEach((node) => { node.disabled = busy || !authenticated; });
  }
  function resetPrivate() {
    historySequence++; accountSequence++;
    clearDelivery();
    for (const id of ["history", "requests", "principals", "batch-result", "registration-result"]) $(id).replaceChildren();
    $("batch-result").hidden = true; $("registration-result").hidden = true;
    $("register-panel").hidden = true; $("register-form").reset(); $("bootstrap-label").hidden = true;
    $("issue-form").reset(); $("filter-form").reset(); $("accounts-view").hidden = true; $("keys-view").hidden = false;
    $("tab-keys").classList.add("selected"); $("tab-keys").setAttribute("aria-current", "page");
    $("tab-accounts").classList.remove("selected"); $("tab-accounts").removeAttribute("aria-current");
    if ($("confirm-dialog").open) $("confirm-dialog").close("cancel"); updateControls();
  }
  async function connect(clearMessage = true) {
    if (destroyed) return;
    $("retry-session").hidden = true; if (clearMessage) message("Соединение…");
    try { await client.resume(); updateControls(); if (clearMessage) message(""); if (client.state.authenticated) await loadHistory(); }
    catch (error) { if (!destroyed) { message(errorText(error), true); $("retry-session").hidden = false; } }
    updateControls();
  }
  async function run(action, { mutation = false } = {}) {
    if (busy || destroyed) return;
    busy = true; updateControls();
    try { await action(); }
    catch (error) { if (error.code !== "SESSION_CHANGED") message(errorText(error, mutation), true); }
    finally { busy = false; updateControls(); }
  }
  function requireCredentials() { if (!credentials?.get || !credentials?.create) throw new ApiError("PASSKEY_VERIFICATION_FAILED"); }
  async function login() {
    requireCredentials(); message("Подтвердите вход на устройстве…");
    const value = $("login-request-number").value;
    const body = value ? { request_number: Number(value) } : {};
    const challenge = await client.request("auth/login-options", { body });
    const generation = client.generation;
    const credential = await credentials.get({ publicKey: credentialOptions(challenge.options) });
    if (generation !== client.generation) throw new ApiError("SESSION_CHANGED");
    const result = await client.request("auth/login-verify", { body: { challenge_id: challenge.challenge_id, credential: serializeCredential(credential) } });
    client.install(result); resetPrivate(); updateControls(); message("Вход выполнен.");
    requestPreference.save(value);
    await loadHistory();
  }
  function showRegistration() {
    preparedRegistration = null;
    $("register-panel").hidden = false; $("registration-result").hidden = true; $("registration-result").replaceChildren();
    $("register-name").value = client.state.principal?.name ?? ""; $("register-name").focus();
  }
  let preparedRegistration = null;
  async function register() {
    requireCredentials(); $("registration-result").hidden = true;
    const body = { name: $("register-name").value.trim(), device_label: $("device-label").value.trim() };
    const prepared = preparedRegistration;
    if (prepared && prepared.name === body.name && prepared.label === body.device_label && prepared.generation === client.generation && prepared.expires > Date.now()) {
      preparedRegistration = null;
      message("Подтвердите создание Passkey на устройстве…");
      // A fresh button click keeps user activation available in mobile browsers.
      const credential = await credentials.create({ publicKey: credentialOptions(prepared.challenge.options, true) });
      if (prepared.generation !== client.generation) throw new ApiError("SESSION_CHANGED");
      const result = await client.request("auth/register-verify", { body: { challenge_id: prepared.challenge.challenge_id, credential: serializeCredential(credential) } });
      if (!Number.isInteger(result.request_number) || !/^[a-f0-9]{64}$/.test(result.fingerprint) || !["owner_ready", "pending"].includes(result.status)) throw new ApiError("INVALID_RESPONSE");
      requestPreference.save(result.request_number); $("login-request-number").value = String(result.request_number);
      $("registration-result").replaceChildren(el("strong", `Запрос № ${result.request_number}`), el("p", `Устройство: ${body.device_label}`), el("p", "Отпечаток:"), el("p", result.fingerprint, "fingerprint"), el("p", result.status === "owner_ready" ? "Passkey владельца создан. Теперь нажмите «Войти с Passkey»." : "Передайте номер и полный отпечаток владельцу. После одобрения войдите с этим Passkey."));
      $("registration-result").hidden = false; message(result.status === "owner_ready" ? "Первоначальная настройка завершена." : "Запрос ожидает одобрения владельца.");
      return;
    }
    if (!$("bootstrap-label").hidden && $("bootstrap").value) body.bootstrap = $("bootstrap").value;
    $("bootstrap").value = "";
    const challenge = await client.request("auth/register-options", { body });
    delete body.bootstrap;
    preparedRegistration = { challenge, name: body.name, label: body.device_label, generation: client.generation, expires: Date.now() + 240000 };
    message("Готово к подтверждению. Нажмите «Создать Passkey» ещё раз, чтобы открыть системное окно.");
  }
  async function confirm(title, text, label = "Подтвердить", danger = true) {
    if ($("confirm-dialog").open) return false;
    $("confirm-title").textContent = title; $("confirm-text").textContent = text;
    $("confirm-submit").textContent = label; $("confirm-submit").classList.toggle("danger", danger); $("confirm-submit").classList.toggle("primary", !danger);
    return new Promise((resolve) => { const dialog = $("confirm-dialog"); dialog.returnValue = ""; dialog.addEventListener("close", () => resolve(dialog.returnValue === "confirm"), { once: true }); dialog.showModal(); });
  }
  function date(value) { return new Date(value * 1000).toLocaleString("ru-RU", { timeZone: "Europe/Moscow", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }); }
  function clearDelivery() {
    previewUrls.forEach((url) => URL.revokeObjectURL(url)); previewUrls = []; deliveryKeys = [];
    $("batch-result").replaceChildren(); $("batch-result").hidden = true;
  }
  async function fileFor(path, filename) {
    const result = await client.request(path, { blob: true });
    return new File([result.data], downloadFilename(result.disposition, filename), { type: result.data.type });
  }
  async function saveFile(file) {
    if (saveBlob) { await saveBlob(file, file.name); return; }
    const url = URL.createObjectURL(file); const anchor = el("a"); anchor.href = url; anchor.download = file.name; anchor.hidden = true;
    doc.body.append(anchor); anchor.click(); anchor.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  async function download(path, filename) { await saveFile(await fileFor(path, filename)); }
  function deliveryAction(operation, success) {
    if (busy || destroyed || !client.state.authenticated) return;
    // Invoke clipboard/share immediately in the click gesture, with files already prepared.
    const generation = client.generation;
    try { Promise.resolve(operation()).then(() => { if (generation === client.generation && success) message(success); }, (error) => {
      if (generation === client.generation && error.name !== "AbortError") message("Не удалось передать файл. Скачайте его и прикрепите в мессенджере.", true);
    }); } catch { message("В этом браузере передача файла недоступна. Скачайте его и прикрепите в мессенджере."); }
  }
  function copyImage(file) {
    deliveryAction(() => {
      if (!clipboardItem || !delivery?.clipboard?.write) throw new Error("Clipboard unavailable");
      return delivery.clipboard.write([new clipboardItem({ "image/png": file })]);
    }, "Изображение скопировано. Его можно вставить в мессенджер.");
  }
  function fileButtons(file, label) {
    const actions = el("div", null, "actions");
    const button = (name, text, action) => { const node = el("button", text); node.type = "button"; node.prepend(icon(name)); node.addEventListener("click", action); return node; };
    actions.append(button("download", `Скачать ${label}`, () => run(() => saveFile(file))));
    if (file.type === "image/png") actions.append(button("copy", `Копировать ${label}`, () => copyImage(file)));
    actions.append(button("share", `Поделиться ${label}`, () => shareFile(file)));
    return actions;
  }
  function shareFile(file) {
    if (busy || destroyed || !client.state.authenticated) return;
    const generation = client.generation;
    const probe = { share: Number(typeof delivery?.share === "function"), can_share: Number(typeof delivery?.canShare === "function"), file_ok: "unknown", active: Number(delivery?.userActivation?.isActive === true), type: file.type === "image/png" ? "png" : "zip" };
    try { if (probe.can_share) probe.file_ok = Number(delivery.canShare({ files: [file] })); } catch { probe.file_ok = "error"; }
    function report(outcome) {
      if (generation !== client.generation) return;
      const allowed = new Set(["started", "done", "AbortError", "NotAllowedError", "TypeError", "InvalidStateError", "DataError", "SHARE_UNAVAILABLE"]);
      const params = new URLSearchParams({ share_probe: "1", ...probe, outcome: allowed.has(outcome) ? outcome : "other" });
      // Only bounded capability flags reach the existing access log, never file data or identifiers.
      client.request(`state?${params}`, { notifyExpired: false }).catch(() => {});
    }
    function failed(error) {
      if (generation !== client.generation) return;
      report(error.code ?? error.name);
      if (error.name === "AbortError") { message("Отправка отменена."); return; }
      if (error.code === "SHARE_UNAVAILABLE") message("Этот браузер не предоставляет сайту системное меню отправки файлов. Скачайте изображение и отправьте его из Галереи.", true);
      else if (error.name === "TypeError") message("Браузер не поддерживает отправку этого файла. Скачайте его и отправьте из Галереи или приложения «Файлы».", true);
      else message("Браузер не открыл меню отправки. Скачайте файл и отправьте его из Галереи или приложения «Файлы».", true);
    }
    try { const result = sharePreparedFile(delivery, file); report("started"); Promise.resolve(result).then(() => report("done"), failed); }
    catch (error) { failed(error); }
  }
  function showFiles(keys, png, archive = null) {
    clearDelivery(); deliveryKeys = keys.map((key) => key.key_id);
    const title = keys.length === 1 ? `Квартира ${keys[0].apartment}, QR № ${keys[0].apartment_number}` : `Квартира ${keys[0].apartment}: ${keys.length} QR`;
    const image = el("img"); image.alt = title; const url = URL.createObjectURL(png); previewUrls.push(url); image.src = url;
    const preview = el("button", null, "qr-preview"); preview.type = "button"; preview.title = "Копировать изображение"; preview.setAttribute("aria-label", "Копировать изображение QR"); preview.append(image); preview.addEventListener("click", () => copyImage(png));
    $("batch-result").append(el("strong", title), preview, fileButtons(png, keys.length === 1 ? "QR" : "коллаж"));
    if (archive) $("batch-result").append(fileButtons(archive, "ZIP"));
    $("batch-result").hidden = false; updateControls();
  }
  async function showKey(key) {
    const generation = client.generation;
    const file = await fileFor(`key/${encodeURIComponent(key.key_id)}/access.png`, `austria-key-${key.apartment.replaceAll("/", "-")}-${key.apartment_number}.png`);
    if (generation !== client.generation) throw new ApiError("SESSION_CHANGED");
    showFiles([key], file); message("");
  }
  async function loadHistory() {
    if (!client.state.authenticated) return;
    const sequence = ++historySequence;
    const params = new URLSearchParams();
    if ($("filter-apartment").value.trim()) params.set("apartment", $("filter-apartment").value.trim());
    if ($("filter-status").value) params.set("status", $("filter-status").value);
    const result = await client.request(`history?${params}`);
    if (sequence !== historySequence || !client.state.authenticated) return;
    if (!Array.isArray(result.keys)) throw new ApiError("INVALID_RESPONSE");
    $("history").replaceChildren(); $("history-empty").hidden = result.keys.length !== 0;
    for (const key of result.keys) {
      if (typeof key.key_id !== "string" || typeof key.apartment !== "string" || !Number.isInteger(key.apartment_number) || !labels[key.status]) throw new ApiError("INVALID_RESPONSE");
      const row = el("tr"); row.dataset.ordinal = String(key.apartment_number);
      for (const text of [date(key.created_at), key.apartment, String(key.apartment_number), String(key.quantity)]) row.append(el("td", text));
      const state = el("td"); state.append(el("span", labels[key.status], `badge ${key.status}`)); row.append(state);
      const cell = el("td"), actions = el("div", null, "actions");
      if (key.download_available) {
        actions.append(iconButton("view", `Показать QR ${key.apartment} № ${key.apartment_number}`, () => run(() => showKey(key))));
        actions.append(iconButton("download", `Скачать QR ${key.apartment} № ${key.apartment_number}`, () => run(() => download(`key/${encodeURIComponent(key.key_id)}/access.png`, `austria-key-${key.apartment.replaceAll("/", "-")}-${key.apartment_number}.png`))));
      }
      if (key.status !== "revoked") actions.append(iconButton("revoke", `Отозвать QR ${key.apartment} № ${key.apartment_number}`, async () => {
        if (busy || !await confirm("Отозвать доступ?", `Квартира ${key.apartment}, QR № ${key.apartment_number}.\nОтзыв нельзя отменить. Контроллер обычно получает его в течение 5 минут; без связи ранее активированный доступ может действовать до 24 часов после последней синхронизации.`, "Отозвать")) return;
        run(async () => { await client.request("revoke", { body: { key_id: key.key_id, apartment: key.apartment, apartment_number: key.apartment_number } }); if (deliveryKeys.includes(key.key_id)) clearDelivery(); message(`Доступ ${key.apartment}, QR № ${key.apartment_number} отозван.`); await loadHistory(); }, { mutation: true });
      }, true));
      if (!actions.children.length) actions.append(el("span", "—", "muted")); cell.append(actions); row.append(cell); $("history").append(row);
    }
    updateControls();
  }
  async function issue() {
    const apartment = $("apartment").value.trim(), quantity = Number($("quantity").value);
    if (!/^[0-9]{1,5}(\/[0-9]{1,5})?$/.test(apartment)) throw new ApiError("INVALID_APARTMENT");
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 50) throw new ApiError("QUANTITY_1_TO_50");
    message("Выдача QR…");
    clearDelivery();
    const result = await client.request("issue", { body: { apartment, quantity } });
    if (result.quantity !== quantity || typeof result.batch_id !== "string") throw new ApiError("INVALID_RESPONSE");
    message("QR выпущены. Подготовка файлов…");
    const generation = client.generation;
    const history = await client.request(`history?apartment=${encodeURIComponent(apartment)}`);
    if (!Array.isArray(history.keys)) throw new ApiError("INVALID_RESPONSE");
    const keys = history.keys.filter((key) => key.batch_id === result.batch_id).sort((a, b) => a.apartment_number - b.apartment_number);
    if (keys.length !== quantity || keys.some((key) => !key.download_available || typeof key.key_id !== "string" || key.apartment !== apartment || !Number.isInteger(key.apartment_number))) throw new ApiError("INVALID_RESPONSE");
    const files = [];
    for (const key of keys) files.push(await fileFor(`key/${encodeURIComponent(key.key_id)}/access.png`, `austria-key-${apartment.replaceAll("/", "-")}-${key.apartment_number}.png`));
    const png = quantity === 1 ? files[0] : new File([await qrCollage(files, doc)], `austria-key-${apartment.replaceAll("/", "-")}-collage-${keys[0].apartment_number}-${keys[keys.length - 1].apartment_number}.png`, { type: "image/png" });
    const archive = quantity === 1 ? null : await fileFor(`batch/${encodeURIComponent(result.batch_id)}/access.zip`, "austria-key-qr.zip");
    if (generation !== client.generation) throw new ApiError("SESSION_CHANGED");
    showFiles(keys, png, archive); message("QR готовы к отправке."); await loadHistory();
  }
  async function loadAccounts() {
    if (!client.state.authenticated || client.state.principal.role !== "owner") return;
    const sequence = ++accountSequence, result = await client.request("accounts");
    if (sequence !== accountSequence || !client.state.authenticated || client.state.principal.role !== "owner") return;
    if (![result.principals, result.passkeys, result.requests].every(Array.isArray)) throw new ApiError("INVALID_RESPONSE");
    $("requests").replaceChildren(); $("principals").replaceChildren(); $("requests-empty").hidden = result.requests.length !== 0; $("principals-empty").hidden = result.principals.length !== 0;
    for (const request of result.requests) {
      const key = result.passkeys.find((item) => item.credential_id === request.credential_id);
      if (!key || !/^[a-f0-9]{64}$/.test(key.fingerprint)) throw new ApiError("INVALID_RESPONSE");
      const row = el("tr"); row.append(el("td", `№ ${request.number}\n${date(request.created_at)}`));
      const who = el("td"); who.append(el("strong", request.claimed_name), el("div", key.device_label, "muted")); row.append(who);
      row.append(el("td", key.fingerprint, "fingerprint"));
      const destination = el("select"); destination.setAttribute("aria-label", `Назначение запроса № ${request.number}`);
      const fresh = el("option", "Новый администратор"); fresh.value = ""; destination.append(fresh);
      for (const principal of result.principals.filter((item) => item.disabled_at == null)) { const option = el("option", `${principal.name}${principal.role === "owner" ? " (владелец)" : ""}`); option.value = principal.id; destination.append(option); }
      const target = el("td"); target.append(destination); row.append(target);
      const actions = el("div", null, "actions"), cell = el("td");
      for (const action of ["approve", "reject"]) actions.append(iconButton(action, `${action === "approve" ? "Одобрить" : "Отклонить"} запрос № ${request.number}`, async () => {
        if (busy) return;
        const principal = destination.value, name = destination.selectedOptions[0].textContent;
        const prompt = `Запрос № ${request.number}: ${request.claimed_name}\nУстройство: ${key.device_label}\nОтпечаток: ${key.fingerprint}\n${action === "approve" ? `Назначение: ${name}.\nСведения сверены с человеком по независимому каналу?` : "Этот Passkey не получит доступ."}`;
        if (!await confirm(action === "approve" ? "Одобрить Passkey?" : "Отклонить запрос?", prompt, action === "approve" ? "Одобрить" : "Отклонить", action !== "approve")) return;
        run(async () => { const body = { number: request.number, fingerprint: key.fingerprint }; if (action === "approve" && principal) body.principal_id = principal; await client.request(`accounts/${action}`, { body }); message(`Запрос № ${request.number} ${action === "approve" ? "одобрен" : "отклонён"}.`); await loadAccounts(); }, { mutation: true });
      }, action === "reject"));
      cell.append(actions); row.append(cell); $("requests").append(row);
    }
    for (const principal of result.principals) {
      const block = el("div", null, `principal${principal.disabled_at != null ? " disabled" : ""}`), heading = el("div", null, "principal-heading");
      const title = el("div"); title.append(el("strong", principal.name), el("div", `${principal.role === "owner" ? "Владелец" : "Администратор"}${principal.disabled_at != null ? " · отключён" : ""}`, "muted")); heading.append(title);
      if (principal.role !== "owner" && principal.disabled_at == null) heading.append(iconButton("revoke", `Отключить администратора ${principal.name}`, async () => {
        if (busy || !await confirm("Отключить администратора?", `${principal.name}\nВсе его Passkey перестанут давать право входа.`, "Отключить")) return;
        run(async () => { await client.request("accounts/disable-admin", { body: { principal_id: principal.id } }); message("Администратор отключён."); await loadAccounts(); }, { mutation: true });
      }, true));
      block.append(heading);
      for (const key of result.passkeys.filter((item) => item.principal_id === principal.id)) {
        const row = el("div", null, "passkey-row"); row.append(el("div", `${key.device_label}${key.revoked_at != null ? " · отозван" : ""}`), el("div", key.fingerprint, "fingerprint"));
        if (key.revoked_at == null) row.append(iconButton("revoke", `Отозвать Passkey ${key.device_label}`, async () => {
          if (busy || !await confirm("Отозвать Passkey?", `${principal.name}\nУстройство: ${key.device_label}\nОтпечаток: ${key.fingerprint}\nЭтот Passkey перестанет давать право входа. Другие Passkey сохранятся.`, "Отозвать")) return;
          run(async () => { await client.request("accounts/revoke-passkey", { body: { credential_id: key.credential_id } }); message("Passkey отозван."); await loadAccounts(); }, { mutation: true });
        }, true));
        block.append(row);
      }
      $("principals").append(block);
    }
    updateControls();
  }
  $("login").addEventListener("click", () => run(login));
  $("show-register").addEventListener("click", showRegistration); $("extra-passkey").addEventListener("click", showRegistration);
  $("close-register").addEventListener("click", () => { $("register-panel").hidden = true; $("bootstrap").value = ""; });
  $("show-bootstrap").addEventListener("click", () => { $("bootstrap-label").hidden = !$("bootstrap-label").hidden; $("bootstrap").value = ""; });
  $("register-form").addEventListener("submit", (event) => { event.preventDefault(); run(register); });
  $("issue-form").addEventListener("submit", (event) => { event.preventDefault(); run(issue, { mutation: true }); });
  $("filter-form").addEventListener("submit", (event) => { event.preventDefault(); run(loadHistory); });
  $("refresh-history").addEventListener("click", () => run(loadHistory)); $("refresh-accounts").addEventListener("click", () => run(loadAccounts));
  $("retry-session").addEventListener("click", () => run(() => connect()));
  $("tab-keys").addEventListener("click", () => { $("keys-view").hidden = false; $("accounts-view").hidden = true; $("tab-keys").classList.add("selected"); $("tab-accounts").classList.remove("selected"); $("tab-keys").setAttribute("aria-current", "page"); $("tab-accounts").removeAttribute("aria-current"); });
  $("tab-accounts").addEventListener("click", () => {
    if (client.state.principal?.role !== "owner") return;
    $("keys-view").hidden = true; $("accounts-view").hidden = false; $("tab-keys").classList.remove("selected"); $("tab-accounts").classList.add("selected"); $("tab-accounts").setAttribute("aria-current", "page"); $("tab-keys").removeAttribute("aria-current"); run(loadAccounts);
  });
  $("logout").addEventListener("click", () => run(async () => {
    try { await client.request("logout", { body: {} }); }
    finally { client.clear(); resetPrivate(); message("Вы вышли из панели."); await connect(false); }
  }));
  return { start: () => run(() => connect()), destroy: () => { destroyed = true; client.clear(); resetPrivate(); }, getState: () => client.state };
}
