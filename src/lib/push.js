import { config, edge } from './api.js';
let preparing;
export function isIOS() { return /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1); }
export function standalone() { return window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true; }
export async function preparePush(userId) {
  if (!config.oneSignalAppId) throw Error('Hệ thống thông báo chưa được kết nối.');
  if (isIOS() && !standalone()) throw Error('Hãy thêm Super Day vào Màn hình chính bằng Safari, rồi mở ứng dụng từ biểu tượng để bật thông báo.');
  if (!('Notification' in window) || !('serviceWorker' in navigator)) throw Error('Thiết bị hoặc trình duyệt này chưa hỗ trợ thông báo đẩy.');
  if (!preparing) preparing = new Promise((resolve, reject) => {
    window.OneSignalDeferred = window.OneSignalDeferred || [];
    window.OneSignalDeferred.push(async OneSignal => {
      try {
        const base = new URL('../..', import.meta.url).pathname;
        await OneSignal.init({ appId: config.oneSignalAppId, serviceWorkerPath: base + 'push/OneSignalSDKWorker.js', serviceWorkerParam: { scope: base + 'push/' }, notifyButton: { enable: false }, welcomeNotification: { disable: true }, autoResubscribe: false });
        resolve(OneSignal);
      } catch (e) { reject(e); }
    });
    const script = document.createElement('script'); script.src = 'https://cdn.onesignal.com/sdks/web/v16/OneSignalSDK.page.js'; script.defer = true;
    script.onerror = () => reject(Error('Không tải được hệ thống thông báo.')); document.head.append(script);
  });
  const oneSignal = await preparing;
  const { token } = await edge('identity');
  await oneSignal.login(userId, token);
  return oneSignal;
}
export async function detachPush() {
  if (!preparing) return;
  let sdk; try { sdk = await preparing; } catch { return; }
  await sdk.User.PushSubscription.optOut(); await sdk.logout();
}
