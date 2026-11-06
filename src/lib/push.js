import { config } from './api.js';
let preparing;
export function isIOS() { return /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1); }
export function standalone() { return window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true; }
export function pushPaths() {
  const base = new URL('../..', import.meta.url).pathname;
  return { scope: base + 'push/', file: 'OneSignalSDKWorker.js', worker: base + 'push/OneSignalSDKWorker.js' };
}
function pushError(code, message, details) {
  const error = new Error(`[${code}] ${message}`); error.code = code; error.pushDetails = details; return error;
}
function deadline(promise, ms, code, message) {
  let timer;
  return Promise.race([promise, new Promise((_, reject) => { timer = setTimeout(() => reject(pushError(code, message)), ms); })]).finally(() => clearTimeout(timer));
}
export function describePushError(error) {
  if (error?.code && String(error.code).startsWith('PUSH_')) return error.message;
  return `${error?.name || 'Error'}: ${String(error?.message || error || 'Không rõ nguyên nhân').slice(0, 450)}`;
}
async function checkWorkerFile() {
  const { worker } = pushPaths();
  let response;
  try { response = await deadline(fetch(worker, { cache: 'no-store' }), 12000, 'PUSH_WORKER_TIMEOUT', `Không tải được ${worker}. Kiểm tra kết nối rồi tải lại ứng dụng.`); }
  catch (error) { if (error.code) throw error; throw pushError('PUSH_WORKER_FETCH', `${worker}: ${describePushError(error)}`); }
  if (!response.ok) throw pushError('PUSH_WORKER_HTTP', `${worker} trả HTTP ${response.status}.`);
  const type = response.headers.get('content-type') || '';
  if (!/javascript|ecmascript/i.test(type)) throw pushError('PUSH_WORKER_MIME', `${worker} phải là JavaScript, hiện nhận ${type || 'không có Content-Type'}.`);
  const source = await response.text();
  if (!source.includes('importScripts') || !source.includes('sdks/web/v16/OneSignalSDK.sw.js')) throw pushError('PUSH_WORKER_CONTENT', `${worker} không chứa bộ xử lý OneSignal Web SDK v16.`);
}
export async function preparePush(userId) {
  if (!userId) throw pushError('PUSH_ACCOUNT', 'Cần đăng nhập để liên kết thiết bị.');
  if (!config.oneSignalAppId) throw pushError('PUSH_CONFIG', 'Hệ thống thông báo chưa được kết nối.');
  if (isIOS() && !standalone()) throw pushError('PUSH_INSTALL', 'Hãy mở Super Day từ biểu tượng trên Màn hình chính iPhone, rồi đăng ký thông báo.');
  if (window.isSecureContext === false) throw pushError('PUSH_HTTPS', 'Web Push cần kết nối HTTPS.');
  if (!('Notification' in window) || !('PushManager' in window) || !('serviceWorker' in navigator)) throw pushError('PUSH_UNSUPPORTED', 'Thiết bị hoặc trình duyệt này chưa hỗ trợ Web Push. iPhone cần iOS 16.4 trở lên.');
  if (!preparing) {
    let initStarted = false;
    preparing = (async () => {
      await checkWorkerFile();
      return new Promise((resolve, reject) => {
        window.OneSignalDeferred = window.OneSignalDeferred || [];
        const initialize = async OneSignal => {
          initStarted = true;
          try {
            const paths = pushPaths();
            await OneSignal.init({
              appId: config.oneSignalAppId,
              // A directory plus a relative filename avoids a protocol-relative // URL in v16.
              path: paths.scope,
              serviceWorkerPath: paths.file,
              serviceWorkerParam: { scope: paths.scope },
              // Typical Website integrations otherwise take worker settings from the dashboard.
              serviceWorkerOverrideForTypical: true,
              notifyButton: { enable: false }, welcomeNotification: { disable: true },
              autoResubscribe: true,
            });
            resolve(OneSignal);
          } catch (error) { reject(pushError('PUSH_SDK_INIT', `${describePushError(error)}. Hãy tải lại ứng dụng để khởi tạo lại SDK.`)); }
        };
        window.OneSignalDeferred.push(initialize);
        const script = document.createElement('script'); script.src = 'https://cdn.onesignal.com/sdks/web/v16/OneSignalSDK.page.js'; script.defer = true;
        script.onerror = () => {
          if (Array.isArray(window.OneSignalDeferred)) window.OneSignalDeferred = window.OneSignalDeferred.filter(callback => callback !== initialize);
          script.remove(); reject(pushError('PUSH_SDK_DOWNLOAD', 'Không tải được SDK từ cdn.onesignal.com. Kiểm tra kết nối rồi thử lại.'));
        };
        document.head.append(script);
      });
    })().catch(error => { if (!initStarted) preparing = null; throw error; });
  }
  const sdk = await deadline(preparing, 25000, 'PUSH_SDK_TIMEOUT', 'SDK chưa khởi tạo xong. Kiểm tra kết nối và tải lại ứng dụng.');
  await deadline(sdk.login(userId), 15000, 'PUSH_LOGIN_TIMEOUT', 'Chưa liên kết được thiết bị với tài khoản OneSignal.');
  return sdk;
}
export function readPushState(sdk, userId) {
  const subscription = sdk?.User?.PushSubscription;
  const permission = window.Notification?.permission || sdk?.Notifications?.permissionNative || 'default';
  const result = {
    permission, sdkPermission: sdk?.Notifications?.permission === true,
    id: typeof subscription?.id === 'string' && subscription.id.trim() ? subscription.id : null, tokenPresent: typeof subscription?.token === 'string' && Boolean(subscription.token.trim()), optedIn: subscription?.optedIn === true,
    linked: Boolean(userId) && sdk?.User?.externalId === userId,
    expectedScope: pushPaths().scope, workerScope: null, workerScript: null, workerActive: false,
    nativeTokenPresent: false, ready: false, workerError: '',
  };
  result.sdkReady = result.permission === 'granted' && result.sdkPermission && Boolean(result.id) && result.tokenPresent && result.optedIn && result.linked;
  return result;
}
export async function inspectPush(sdk, userId) {
  const state = readPushState(sdk, userId);
  try {
    // ready/getRegistration() without a URL returns the PWA worker, which is not the push worker.
    const expected = new URL(state.expectedScope, location.origin).href;
    const registration = await deadline(navigator.serviceWorker.getRegistration(expected), 4000, 'PUSH_WORKER_LOOKUP', 'Trình duyệt chưa trả về Service Worker.');
    if (!registration) { state.workerError = `Không có Service Worker tại ${state.expectedScope}`; return state; }
    state.workerScope = new URL(registration.scope).pathname;
    const active = registration.active;
    state.workerScript = active?.scriptURL ? new URL(active.scriptURL).pathname : null;
    if (registration.scope !== expected) { state.workerError = `Scope đang là ${state.workerScope}; cần ${state.expectedScope}. Worker PWA không thay thế được worker OneSignal.`; return state; }
    state.workerActive = active?.state === 'activated' && state.workerScript === pushPaths().worker;
    if (!state.workerActive) { state.workerError = `Worker OneSignal chưa hoạt động: ${state.workerScript || 'chưa có active worker'}.`; return state; }
    if (!registration.pushManager) { state.workerError = 'Service Worker không có PushManager.'; return state; }
    const native = await deadline(registration.pushManager.getSubscription(), 4000, 'PUSH_NATIVE_LOOKUP', 'Trình duyệt chưa trả về Web Push subscription.');
    state.nativeTokenPresent = Boolean(native?.endpoint);
    state.ready = state.sdkReady && state.nativeTokenPresent;
  } catch (error) { state.workerError = describePushError(error); }
  return state;
}
export function pushStateLabel(state) {
  if (state?.ready) return 'Đã đăng ký nhận thông báo trên thiết bị này';
  if (state?.permission === 'denied') return 'Thông báo đang bị chặn trong cài đặt thiết bị';
  if (state?.permission === 'granted') return 'Đã có quyền, nhưng thiết bị chưa đăng ký nhận thông báo';
  return 'Chưa đăng ký — hãy bấm Cho phép thông báo';
}
export function observePush(sdk, callback) {
  const changed = () => callback();
  sdk.User.PushSubscription.addEventListener('change', changed);
  sdk.Notifications.addEventListener('permissionChange', changed);
  sdk.User.addEventListener('change', changed);
  return () => {
    sdk.User.PushSubscription.removeEventListener('change', changed);
    sdk.Notifications.removeEventListener('permissionChange', changed);
    sdk.User.removeEventListener('change', changed);
  };
}
export async function registerPush(sdk, userId, { timeoutMs = 20000, pollMs = 300, onProgress = () => {}, isCurrentUser = () => true } = {}) {
  if (readPushState(sdk, userId).permission === 'denied') throw pushError('PUSH_PERMISSION_DENIED', 'Mở Cài đặt iPhone → Thông báo → Super Day và cho phép thông báo.');
  // Invoke the native registration flow immediately in the click gesture, before any await.
  // optIn() alone can only flip an opt-out flag when permission was already granted.
  const request = sdk.Notifications.requestPermission();
  let result;
  try { result = await deadline(request, 30000, 'PUSH_REQUEST_TIMEOUT', 'OneSignal chưa hoàn tất yêu cầu đăng ký. Hãy thử lại từ biểu tượng trên Màn hình chính.'); }
  catch (error) { const details = await inspectPush(sdk, userId); if (error.pushDetails) throw error; throw pushError('PUSH_REGISTER', describePushError(error), details); }
  if (!isCurrentUser()) throw pushError('PUSH_ACCOUNT_CHANGED', 'Tài khoản đã thay đổi. Hãy đăng ký lại trong tài khoản hiện tại.');
  const permission = readPushState(sdk, userId).permission;
  if (permission !== 'granted') throw pushError('PUSH_PERMISSION', permission === 'denied' ? 'iPhone đang chặn thông báo. Mở Cài đặt → Thông báo → Super Day.' : 'Chưa được cấp quyền thông báo. Hãy bấm Cho phép và chấp nhận lời nhắc.');
  await deadline(sdk.User.PushSubscription.optIn(), 10000, 'PUSH_OPT_IN_TIMEOUT', 'OneSignal chưa bật trạng thái nhận thông báo.');
  if (!isCurrentUser()) throw pushError('PUSH_ACCOUNT_CHANGED', 'Tài khoản đã thay đổi. Hãy đăng ký lại trong tài khoản hiện tại.');
  await deadline(sdk.login(userId), 15000, 'PUSH_LOGIN_TIMEOUT', 'Chưa liên kết được subscription với tài khoản.');
  const started = Date.now(); let state;
  do {
    if (!isCurrentUser()) throw pushError('PUSH_ACCOUNT_CHANGED', 'Tài khoản đã thay đổi. Hãy đăng ký lại.');
    state = await inspectPush(sdk, userId); state.requestResult = typeof result === 'boolean' ? result : null;
    onProgress(state);
    if (state.ready) return state;
    if (Date.now() - started >= timeoutMs) break;
    await new Promise(resolve => setTimeout(resolve, pollMs));
  } while (true);
  const reason = state.workerError || (!state.nativeTokenPresent ? 'Trình duyệt chưa tạo Web Push Token cho worker OneSignal. Kiểm tra kết nối tới dịch vụ Apple Push rồi thử lại.' : !state.tokenPresent ? 'OneSignal chưa nhận Push Token từ trình duyệt.' : !state.id ? 'OneSignal chưa cấp Subscription ID. Kiểm tra kết nối tới api.onesignal.com.' : !state.optedIn ? 'Subscription vẫn optedIn=false.' : !state.linked ? 'Subscription chưa liên kết đúng tài khoản đăng nhập.' : 'Trạng thái quyền thông báo chưa đồng bộ.');
  throw pushError('PUSH_NOT_READY', `${reason} Quyền=${state.permission}; ID=${state.id ? 'có' : 'chưa'}; token=${state.tokenPresent ? 'có' : 'chưa'}; optedIn=${state.optedIn}.`, state);
}
export async function detachPush() {
  if (!preparing) return;
  let sdk; try { sdk = await preparing; } catch { return; }
  await sdk.User.PushSubscription.optOut(); await sdk.logout();
}
