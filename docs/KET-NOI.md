# Kết nối Super Day với tài khoản thật

Bạn có thể hoàn thành theo thứ tự dưới đây. Không cần gửi khóa bí mật qua trò chuyện.

## 1. Supabase: tài khoản và dữ liệu

Supabase cung cấp đăng nhập bằng email và cơ sở dữ liệu dùng chung giữa các thiết bị, với quyền dữ liệu riêng cho từng người.

1. Tạo một dự án tại https://supabase.com/dashboard và chờ dự án sẵn sàng.
2. Mở **SQL Editor**, chạy toàn bộ tệp `supabase/migrations/202611060001_initial.sql` một lần. Không chạy các tệp trong thư mục `tests` vào dự án thật.
3. Trong **Authentication → Providers**, bật đăng nhập Email và cho phép đăng ký. Giữ yêu cầu xác minh email.
4. Trong **Authentication → URL Configuration**, đặt Site URL và Redirect URL là `https://quangminhdlus-dot.github.io/super-day/`. Nếu chạy cục bộ, thêm `http://localhost:4173/super-day/` vào danh sách redirect.
5. Trong mẫu email **Magic Link**, có thể dùng nội dung sau để đăng nhập bằng mã ngay trên iPhone hoặc bằng liên kết:

```html
<h2>Đăng nhập Super Day</h2>
<p>Mã xác nhận của bạn: <strong>{{ .Token }}</strong></p>
<p><a href="{{ .ConfirmationURL }}">Mở Super Day</a></p>
<p>Nếu bạn không yêu cầu đăng nhập, có thể bỏ qua email này.</p>
```

6. Cấu hình **Custom SMTP** trước khi mở đăng ký cho mọi người. Dịch vụ gửi email mặc định của Supabase bị giới hạn; có thể chỉ gửi tới các địa chỉ được dự án cho phép. Không coi gửi email cho chủ dự án thành công là đã kiểm chứng đăng ký công khai.
7. Lấy **Project URL** và **publishable key** (hoặc legacy `anon` key) từ trang Connect/API của dự án. Đây là hai giá trị công khai được phép đưa vào ứng dụng; RLS mới là lớp bảo vệ dữ liệu.
8. Trong kho GitHub, thêm hai **Actions Variables**: `SUPABASE_URL` và `SUPABASE_ANON_KEY`. Chạy lại workflow **Kiểm tra và xuất bản Super Day**.
9. Mở ứng dụng, đăng nhập bằng email thật. Tạo một việc trên iPhone, mở cùng tài khoản trên máy tính và kiểm tra sau khi đồng bộ. Dữ liệu được tải lại khi quay về ứng dụng và mỗi phút lúc đang mở.
10. Dùng một email thứ hai kiểm tra rằng danh sách công việc và ghi chép riêng không xuất hiện trong tài khoản này.

Không đưa `service_role`, `sb_secret_...` hoặc mật khẩu cơ sở dữ liệu vào `.env` dùng cho giao diện. Bản build từ chối các dạng khóa quản trị đã biết.

## 2. GitHub Pages và iPhone

1. Mở https://github.com/quangminhdlus-dot/super-day/settings/pages, chọn nguồn **GitHub Actions** nếu chưa được bật tự động.
2. Kiểm tra workflow trong tab **Actions**. Chỉ khi bước deploy thành công mới coi URL Pages đã xuất bản.
3. Mở `https://quangminhdlus-dot.github.io/super-day/` bằng Safari trên iPhone.
4. Nhấn **Chia sẻ → Thêm vào Màn hình chính**, rồi mở từ biểu tượng **Super Day**.
5. Đăng nhập trong ứng dụng vừa cài. Phiên Safari và phiên ứng dụng cài đặt có thể có vùng lưu trữ khác nhau trên iOS.

Manifest dùng `id`, `start_url`, `scope`, biểu tượng và tài nguyên bằng đường dẫn tương đối. Có biểu tượng 180/192/512 px, biểu tượng maskable và màn hình mở đầu cho các kích thước iPhone phổ biến. Giao diện chừa vùng an toàn cho thanh điều hướng iPhone. Những mẫu máy khác vẫn có màn hình mở mặc định của hệ điều hành.

## 3. OneSignal: thông báo thật

OneSignal nhận thông báo từ máy chủ và chuyển đến thiết bị, kể cả khi ứng dụng đang đóng. iPhone cần **iOS 16.4+**, ứng dụng được thêm vào Màn hình chính và quyền nhận thông báo do người dùng cấp.

1. Tạo ứng dụng **Web Push** tại https://dashboard.onesignal.com.
2. Dùng cấu hình website tùy chỉnh (Custom Code). Site origin: `https://quangminhdlus-dot.github.io`. URL mở mặc định: `https://quangminhdlus-dot.github.io/super-day/`.
3. Bật **Token Identity Verification** để chỉ máy chủ mới có thể cấp quyền gắn thiết bị với UUID của tài khoản. Lấy App ID, App REST API key và Identity Verification key. Nếu gói/tài khoản chưa hỗ trợ cấu hình này, cần xử lý trên OneSignal trước khi mở push nhiều người dùng.
4. Thêm App ID vào **GitHub Actions Variable** `ONESIGNAL_APP_ID`, rồi xuất bản lại.
5. Trong Supabase, triển khai Edge Function `reminders`. Nếu dùng Supabase CLI trên máy có quyền dự án:

```sh
supabase login
supabase link --project-ref MA_DU_AN
supabase functions deploy reminders --no-verify-jwt
```

Function chủ động xác minh JWT người dùng bằng Supabase Auth; lệnh tắt kiểm tra ở gateway còn cho phép cron dùng bí mật riêng. Không bỏ bước xác minh trong handler.

6. Đặt các giá trị sau trong **Supabase → Edge Functions → Secrets**. Chỉ đặt tại dịch vụ; không commit tệp chứa chúng:

| Tên | Giá trị |
| --- | --- |
| `APP_URL` | `https://quangminhdlus-dot.github.io/super-day/` |
| `ONESIGNAL_APP_ID` | App ID của OneSignal |
| `ONESIGNAL_REST_API_KEY` | App REST API key, bí mật |
| `ONESIGNAL_IDENTITY_KEY` | Identity Verification key, bí mật |
| `REMINDER_CRON_SECRET` | Chuỗi ngẫu nhiên dài ít nhất 32 ký tự, bí mật |

`SUPABASE_URL` và `SUPABASE_SERVICE_ROLE_KEY` được Supabase cấp cho Edge Function. Chỉ mã máy chủ dùng khóa quản trị.

7. Trong **Supabase Vault**, tạo hai secret bằng giao diện Dashboard:

| Tên | Giá trị |
| --- | --- |
| `super_day_function_url` | `https://MA_DU_AN.supabase.co/functions/v1/reminders` |
| `super_day_cron_secret` | Cùng giá trị với `REMINDER_CRON_SECRET` |

8. Chạy `supabase/schedule.sql` trong SQL Editor. Lịch chạy mỗi 5 phút, tìm giờ nhắc theo múi giờ từng tài khoản. Khung trễ 15 phút; không hẹn giờ trong trình duyệt. Các lần thử lại dùng cùng mã chống trùng của OneSignal.
9. Trong ứng dụng đã cài trên iPhone, vào **Cài đặt → Cho phép thông báo**. Chờ thiết bị đăng ký rồi nhấn **Gửi thông báo thử**. Mỗi tài khoản được gửi thử tối đa một lần trong mỗi phút.
10. Đóng ứng dụng và **xác nhận thông báo thực sự xuất hiện trên iPhone**. Nhấn vào thông báo, kiểm tra mở đúng Super Day. Thông báo tối mở phần ghi chép.
11. Đổi một giờ nhắc thành vài phút tới, kiểm tra cron gửi khi ứng dụng đóng. Kiểm tra riêng nhắc sáng/trưa/tối, tắt một nhắc và thử lại. Ghi lại giờ gửi, giờ nhận, phiên bản iOS và thiết bị. Chỉ sau bước này mới đánh dấu hệ thống push đã được kiểm chứng.

### Phạm vi worker trên GitHub Pages

Hai worker có phạm vi riêng:

| Worker | Đường dẫn | Scope |
| --- | --- | --- |
| Vỏ ứng dụng PWA | `/super-day/sw.js` | `/super-day/` |
| OneSignal | `/super-day/push/OneSignalSDKWorker.js` | `/super-day/push/` |

Worker OneSignal được đặt ngay trong thư mục scope nên không cần header `Service-Worker-Allowed` để mở rộng ra gốc tên miền, điều GitHub Pages không cho tùy chỉnh. Scope riêng tránh thay thế worker PWA. OneSignal mở URL tuyệt đối chứa `/super-day/`; không dùng đường dẫn `/` cho nhấp thông báo.

Đã kiểm tra tài nguyên và scope PWA ở đường dẫn con bằng Chromium; đã đối chiếu mã SDK OneSignal v16 cho `serviceWorkerPath`, `serviceWorkerParam` và `login(externalId, jwtToken)`. **Chưa có App ID và iPhone thử nghiệm nên đăng ký worker OneSignal với dịch vụ thật và nhận push vẫn chưa được xác nhận.** Tài liệu trực tuyến OneSignal không truy cập được từ môi trường làm việc; đối chiếu thêm cấu hình hiện tại của Dashboard khi kết nối.

## Thông tin còn cần chủ ứng dụng

Có thể cung cấp trong trò chuyện: **Supabase Project URL**, **publishable/anon key**, **OneSignal App ID**. Đây là cấu hình công khai.

Cần bạn tự đặt tại dịch vụ: SMTP để gửi email cho người dùng công khai, khóa REST và Identity của OneSignal, cron secret và Vault. Sau đó chỉ cần báo đã cấu hình để tiếp tục kiểm chứng; không cần dán giá trị bí mật vào trò chuyện.
