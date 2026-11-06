# Super Day

**Ba việc quan trọng. Một ngày có chủ đích.**

Ứng dụng web tiếng Việt dành cho iPhone và máy tính. Mỗi ngày chọn tối đa ba việc, đánh dấu kết quả, viết vài dòng nhìn lại và theo dõi hành trình.

## Trạng thái triển khai

Mã MVP đã có giao diện ba màn hình, luồng Supabase Auth email/mật khẩu và email dự phòng, tự động lưu với hàng đợi bản nháp, cơ sở dữ liệu RLS, lịch sử chuyển ngày, báo cáo tuần/tháng, xuất JSON, PWA và mã thông báo OneSignal phía máy chủ.

**Khi chưa có cấu hình Supabase, ứng dụng mở bản trải nghiệm có nhãn rõ ràng.** Dữ liệu mẫu chỉ lưu trên thiết bị; không có tài khoản thật và không tự nhập dữ liệu mẫu vào tài khoản. Khi đã cấu hình, người dùng đăng nhập để mở dữ liệu riêng trên Supabase.

Đăng nhập đa thiết bị, email thật và việc nhận push trên iPhone **cần được xác nhận sau khi kết nối các dịch vụ**. Mã nguồn hoặc nút gửi thử không đồng nghĩa với thông báo đã nhận được.

- Kho mã: https://github.com/quangminhdlus-dot/super-day
- Địa chỉ Pages dự kiến: https://quangminhdlus-dot.github.io/super-day/
- [Hướng dẫn kết nối và xuất bản](docs/KET-NOI.md)
- [Kiến trúc, dữ liệu và kiểm chứng](docs/KIEN-TRUC.md)

## Giao diện tối và cỡ chữ

Cả ba màn hình dùng nền tối, điểm nhấn cam và Be Vietnam Pro có đủ dấu tiếng Việt, đóng gói cục bộ để mở ngoại tuyến. Mở **Cài đặt → Cỡ chữ** để chọn **Nhỏ / Trung bình / Lớn**, áp dụng ngay trên giao diện. Mặc định cho tài khoản mới là Trung bình; lựa chọn Rất lớn cũ được đọc thành Lớn, giữ nguyên thời điểm lưu và trạng thái đồng bộ. Cỡ chữ áp dụng cho tiêu đề, công việc, nút, ô nhập và điều hướng; thẻ tự tăng chiều cao khi nội dung dài.

Lựa chọn lưu riêng theo tài khoản trong localStorage, đồng bộ qua `user_metadata.super_day_appearance` của Supabase Auth khi có mạng; bản mới hơn được ưu tiên, thay đổi ngoại tuyến được thử lại khi kết nối trở lại. Không tạo bảng hay migration và không thay đổi dữ liệu công việc, nhật ký hoặc lịch nhắc. Ô nhập tối thiểu 16px và các nút chính tối thiểu 44px.

Ứng dụng mặc định giữ viewport ở tỷ lệ 100% trên cả ba màn hình và hộp thoại, kể cả PWA. `touch-action: pan-x pan-y` cho phép cuộn, loại bỏ thu phóng bằng chạm đúp/hai ngón; viewport khai báo giới hạn tỷ lệ 1. Safari có xử lý dự phòng chỉ cho `gesturestart`/`gesturechange`, không chặn các sự kiện chạm, bấm, chọn văn bản hoặc bàn phím. Một số bản iOS có thể ưu tiên chính sách trợ năng của trình duyệt hơn giới hạn viewport; ứng dụng áp dụng mức kiểm soát nền tảng hỗ trợ, không tự đặt lại tỷ lệ bằng transform và không can thiệp tính năng Thu phóng trợ năng của iOS. Ba mức cỡ chữ trong Cài đặt vẫn hoạt động độc lập với tỷ lệ viewport.

Kiểm tra bố cục và thao tác trong trình duyệt (dữ liệu mẫu/giả lập, không chạm tài khoản thật):

```sh
npm run build
npx playwright install chromium
npm run test:ui
```

Chọn giờ dùng ô `type="time"` gốc của trình duyệt, chỉ có giờ và phút. Khi ô đang mở, ứng dụng giữ nguyên DOM và hoãn việc dựng lại trang/nhận dữ liệu nền, tránh đóng bộ chọn hoặc kéo giá trị về giờ cũ. Bấm **Xong**, Enter hoặc rời ô để lưu một giá trị hoàn chỉnh; các lần cuộn trong lúc chọn không gửi RPC. Khi ứng dụng vào nền, giá trị hợp lệ gần nhất được lưu vào hàng đợi hiện có. Giờ trống, chưa hoàn chỉnh hoặc không đổi không ghi đè lịch đã lưu. Giá trị truyền là `HH:mm` theo múi giờ tài khoản, không chuyển qua UTC ở giao diện; định dạng 12/24 giờ của thiết bị do bộ chọn gốc xử lý.

Các kiểm tra tự động dùng SDK Supabase thật với API/dữ liệu giả lập, kiểm tra cả phản hồi chậm, mất mạng, tải lại và nhận dữ liệu nền cũ; kiểm tra SQL chạy trong cơ sở dữ liệu thử nghiệm tách biệt. Chưa có iPhone thật để xác nhận bộ chọn gốc Safari/PWA hoặc thời điểm thông báo xuất hiện trên thiết bị; các kiểm tra này không thay thế kiểm chứng nhận push thực tế.

Cài đặt hiển thị cố định ba lời nhắc: Mục tiêu ngày mới → Kiểm tra tiến độ → Nhìn lại hôm nay. Thứ tự không phụ thuộc giờ cài đặt; các khóa `morning/noon/evening`, giờ, trạng thái và logic gửi phía máy chủ được giữ nguyên. Thẻ hướng dẫn iPhone được bỏ khỏi Cài đặt; manifest, Service Worker và khả năng cài PWA được giữ nguyên.

Bộ kiểm tra chạy trên năm chiều rộng 320–1440px với cả ba cỡ chữ, ba màn hình, nội dung dài, tự lưu, đổi lịch nhắc và đồng bộ metadata bằng SDK Supabase. GitHub Actions chạy các kiểm tra này trước khi xuất bản. Việc nhận push thực tế vẫn cần kiểm tra trên iPhone đã cài PWA.

## Đăng nhập bằng mật khẩu với tài khoản hiện tại

1. Trên máy tính đang đăng nhập, mở **Cài đặt → Thiết lập hoặc thay đổi mật khẩu**.
2. Nhập mật khẩu mới và nhập lại để xác nhận, bấm **Cập nhật mật khẩu**.
3. Trên iPhone, mở Super Day từ Màn hình chính, chọn **Đăng nhập** và dùng cùng email/mật khẩu.

Ứng dụng dùng `supabase.auth.signInWithPassword` và `supabase.auth.updateUser`. Không tạo tài khoản mới, không cần migration, không cần cấu hình SMTP hoặc tên miền cho luồng này. Supabase tiếp tục quản lý phiên; mật khẩu không được lưu vào localStorage, hàng đợi dữ liệu hay mã nguồn. Nếu Supabase yêu cầu xác thực lại khi đổi mật khẩu, làm theo hướng dẫn/mã xác thực hiện trong hộp thoại; ứng dụng giữ nguyên cơ chế bảo mật đó. Đăng nhập bằng liên kết email vẫn có thể dùng dự phòng.

Tệp giao diện và các module có mã phiên bản để tránh cache cũ. Sau khi triển khai, tải lại trang để nhận mục mật khẩu và tích hợp thông báo mới; không cần xóa dữ liệu trình duyệt hoặc đăng xuất phiên máy tính.

## Chạy trên máy

Cần Node.js 22 trở lên. Giao diện dùng JavaScript và CSS thuần; SDK Supabase chính thức được đóng gói cùng ứng dụng.

```sh
npm ci
npm run dev
```

Mở http://localhost:4173/super-day/. Sau khi sửa mã, chạy lại `npm run dev`. Để kết nối dự án thật, chép `.env.example` thành `.env` rồi điền URL và publishable/anon key. `.env` được bỏ qua bởi Git.

```sh
npm test
npm run test:db
npm run build
npm run preview
```

`test:db` mặc định chạy cùng migration và các kiểm tra bảo mật trong PostgreSQL nhúng (PGlite). Trong CI, biến `DATABASE_URL` trỏ đến một PostgreSQL 16 trống để chạy cùng SQL bằng `psql`. **Không dùng cơ sở dữ liệu sản phẩm cho bộ kiểm tra**: `tests/bootstrap.sql` tạo một Auth giả chỉ dành cho kiểm thử.

## Xuất bản

Workflow `.github/workflows/pages.yml` kiểm tra rồi xuất bản nhánh `main`. Đặt biến công khai trong **Settings → Secrets and variables → Actions → Variables**:

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY` — publishable hoặc legacy anon key
- `ONESIGNAL_APP_ID` — có thể bổ sung sau

Chọn **Settings → Pages → Source: GitHub Actions** nếu kho chưa bật Pages. Nếu không có biến, bản trải nghiệm vẫn có thể xuất bản. Khóa quản trị Supabase và khóa REST của OneSignal chỉ đặt trong **Supabase Edge Function Secrets**, tuyệt đối không đặt vào GitHub Variables dành cho giao diện.

## Tự động triển khai Edge Function reminders

Workflow **Triển khai Supabase reminders** dùng Repository Actions Secret `SUPABASE_ACCESS_TOKEN` và lấy project ref từ Actions Variable `SUPABASE_URL` đang dùng cho giao diện. Không cần nhập lại Project ID hoặc cung cấp mật khẩu cơ sở dữ liệu.

Workflow chạy khi đẩy thay đổi của `supabase/functions/reminders/`, `supabase/functions/_shared/`, `supabase/config.toml` hoặc chính workflow lên `main`. Cũng có thể mở **Actions → Triển khai Supabase reminders → Run workflow → main** để chạy thủ công.

Các kiểm tra xác thực và Deno phải qua trước khi triển khai. Workflow chỉ gọi `supabase functions deploy reminders --project-ref ... --use-api --yes`, giữ `verify_jwt = false` trong cấu hình và xác nhận function thực tế có trạng thái `ACTIVE`, phiên bản và cấu hình JWT đúng sau triển khai. Không chạy migration, không link cơ sở dữ liệu, không chỉnh Auth, dữ liệu, lịch cron hoặc secrets của Edge Function. Token chỉ lấy từ GitHub Secrets và không được in ra log.

## Chẩn đoán đăng ký thông báo trên iPhone

Ứng dụng chỉ báo đã đăng ký khi OneSignal có ID, Push Token, optedIn và đúng External ID, đồng thời worker push có native PushSubscription hợp lệ. Trong Cài đặt, mục **Chi tiết đăng ký thông báo** hiển thị trạng thái và lỗi kỹ thuật, không hiển thị token đầy đủ. [Hướng dẫn đăng ký lại](docs/KET-NOI.md#đăng-ký-lại-khi-có-quyền-nhưng-chưa-có-push-token).

Worker PWA vẫn ở `/super-day/sw.js`; worker OneSignal vẫn ở `/super-day/push/OneSignalSDKWorker.js`. SDK dùng thư mục riêng và tên tệp tương đối, buộc giữ cấu hình này cho cả kiểu Typical Website. Workflow Pages kiểm tra HTTP, MIME và nội dung của cả hai worker sau khi xuất bản.
