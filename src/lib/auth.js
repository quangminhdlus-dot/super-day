// Passwords are passed straight to Supabase Auth; never place them in app state or the data outbox.
export async function signInPassword(auth, email, password) {
  const { data, error } = await auth.signInWithPassword({ email: email.trim(), password });
  if (error) throw error;
  return data;
}
export async function changePassword(auth, { password, confirmation, nonce = '' }) {
  if (password.length < 8) throw Object.assign(new Error(), { code: 'password_too_short' });
  if (password !== confirmation) throw Object.assign(new Error(), { code: 'password_mismatch' });
  const attributes = { password };
  if (nonce.trim()) attributes.nonce = nonce.trim();
  const { data, error } = await auth.updateUser(attributes);
  if (error) throw error;
  return data;
}
export function needsPasswordReauth(error) {
  return ['reauthentication_needed', 'reauthentication_not_valid', 'reauth_nonce_missing'].includes(error?.code);
}
export function passwordErrorMessage(error, changing = false) {
  const messages = {
    password_too_short: 'Mật khẩu mới cần có ít nhất 8 ký tự.',
    password_mismatch: 'Hai lần nhập mật khẩu chưa khớp. Hãy kiểm tra lại.',
    invalid_credentials: 'Email hoặc mật khẩu chưa đúng. Nếu chưa có mật khẩu, hãy thiết lập trong Cài đặt trên máy tính đang đăng nhập.',
    email_not_confirmed: 'Email này chưa được xác minh. Hãy dùng đúng email của tài khoản đã xác minh.',
    weak_password: 'Mật khẩu chưa đáp ứng yêu cầu bảo mật của Supabase. Hãy dùng mật khẩu mạnh hơn theo quy tắc của tài khoản.',
    same_password: 'Mật khẩu mới trùng mật khẩu hiện tại. Hãy chọn mật khẩu khác.',
    reauthentication_needed: 'Supabase yêu cầu xác thực lại trước khi đổi mật khẩu. Hãy yêu cầu mã xác thực bên dưới, hoặc đăng nhập lại bằng mật khẩu hiện tại rồi thử lại.',
    reauth_nonce_missing: 'Supabase yêu cầu mã xác thực lại. Hãy yêu cầu và nhập mã ở bên dưới.',
    reauthentication_not_valid: 'Mã xác thực lại không đúng hoặc đã hết hạn. Hãy yêu cầu mã mới.',
    session_not_found: 'Phiên đăng nhập đã hết hiệu lực. Hãy đăng nhập lại trước khi đổi mật khẩu.',
    session_expired: 'Phiên đăng nhập đã hết hiệu lực. Hãy đăng nhập lại trước khi đổi mật khẩu.',
    over_request_rate_limit: 'Bạn đã thử quá nhiều lần. Hãy đợi một chút rồi thử lại.',
    over_email_send_rate_limit: 'Tạm thời chưa thể gửi thêm mã xác thực. Hãy đợi rồi thử lại, hoặc đăng nhập lại bằng mật khẩu hiện tại.',
  };
  // Only show known messages, never an unfiltered server error which might echo submitted values.
  return messages[error?.code] || (changing
    ? 'Chưa đổi được mật khẩu. Kiểm tra kết nối và yêu cầu bảo mật của tài khoản rồi thử lại. Nếu Supabase yêu cầu phiên mới, hãy đăng nhập lại trước.'
    : 'Chưa đăng nhập được. Kiểm tra email, mật khẩu và kết nối rồi thử lại.');
}
