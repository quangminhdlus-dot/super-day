export function notificationContent(kind, done = 0, total = 0) {
  const progress = total ? ` Bạn đã hoàn thành ${done}/${total} việc quan trọng.` : '';
  return {
    morning: 'Chào ngày mới! Hãy dành hai phút để xác định ba việc quan trọng nhất bạn muốn hoàn thành hôm nay.',
    noon: 'Một nửa ngày đã trôi qua. Bạn đã tiến gần hơn đến ba điều quan trọng của mình chưa?' + progress,
    evening: 'Đã đến lúc nhìn lại ngày hôm nay. Có điều gì bạn muốn ghi nhớ?' + progress,
    test: 'Super Day đã ở đây. Bạn đã nhận được thông báo thử trên thiết bị này.'
  }[kind];
}
export function notificationUrl(appUrl, kind) {
  const url = new URL(appUrl); url.searchParams.set('view', 'today');
  if (kind === 'evening') url.searchParams.set('focus', 'reflection');
  return url.href;
}
export async function identityToken(appId, userId, key, now = Math.floor(Date.now() / 1000)) {
  const encode = obj => btoa(JSON.stringify(obj)).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
  const header = encode({ alg: 'HS256', typ: 'JWT' });
  const payload = encode({ iss: appId, exp: now + 600, identity: { external_id: userId } });
  const message = `${header}.${payload}`;
  const signingKey = await crypto.subtle.importKey('raw', new TextEncoder().encode(key), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const signature = await crypto.subtle.sign('HMAC', signingKey, new TextEncoder().encode(message));
  return `${message}.${btoa(String.fromCharCode(...new Uint8Array(signature))).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '')}`;
}
