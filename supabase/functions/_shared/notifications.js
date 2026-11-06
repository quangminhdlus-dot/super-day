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
