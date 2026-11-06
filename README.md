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

## Đăng nhập bằng mật khẩu với tài khoản hiện tại

1. Trên máy tính đang đăng nhập, mở **Cài đặt → Thiết lập hoặc thay đổi mật khẩu**.
2. Nhập mật khẩu mới và nhập lại để xác nhận, bấm **Cập nhật mật khẩu**.
3. Trên iPhone, mở Super Day từ Màn hình chính, chọn **Đăng nhập** và dùng cùng email/mật khẩu.

Ứng dụng dùng `supabase.auth.signInWithPassword` và `supabase.auth.updateUser`. Không tạo tài khoản mới, không cần migration, không cần cấu hình SMTP hoặc tên miền cho luồng này. Supabase tiếp tục quản lý phiên; mật khẩu không được lưu vào localStorage, hàng đợi dữ liệu hay mã nguồn. Nếu Supabase yêu cầu xác thực lại khi đổi mật khẩu, làm theo hướng dẫn/mã xác thực hiện trong hộp thoại; ứng dụng giữ nguyên cơ chế bảo mật đó. Đăng nhập bằng liên kết email vẫn có thể dùng dự phòng.

Sau khi cập nhật PWA, nếu vẫn thấy giao diện cũ, đóng các tab/cửa sổ Super Day rồi mở lại; không cần xóa dữ liệu trình duyệt hoặc đăng xuất phiên máy tính.

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

Chọn **Settings → Pages → Source: GitHub Actions** nếu kho chưa bật Pages. Nếu không có biến, bản trải nghiệm vẫn có thể xuất bản. Khóa quản trị Supabase và khóa REST/Identity của OneSignal chỉ đặt trong **Supabase Edge Function Secrets**, tuyệt đối không đặt vào GitHub Variables dành cho giao diện.
