# Kiến trúc và kiểm chứng

## Thành phần

- **JavaScript, CSS, esbuild:** giao diện nhẹ, ba màn hình tiếng Việt. esbuild đóng gói SDK Supabase chính thức; không phụ thuộc CDN để mở phần tài khoản sau khi PWA đã lưu bộ tệp.
- **Supabase Auth:** email magic link/OTP, phiên lâu dài và làm mới token bằng SDK; không có hệ thống mật khẩu tự xây.
- **PostgreSQL và RLS:** tài khoản đã xác minh chỉ đọc dữ liệu của mình. Mọi ghi từ giao diện đi qua RPC `mutate`, lấy UUID từ `auth.uid()` thay vì tin UUID do trình duyệt truyền lên.
- **GitHub Pages:** các tệp tĩnh trong `dist`; tài nguyên tương đối, không cần bộ định tuyến máy chủ.
- **Supabase Cron, Vault, Edge Function, OneSignal:** gửi nhắc phía máy chủ theo múi giờ từng tài khoản, giữ khóa bí mật ngoài mã công khai.

## Dữ liệu

`profiles` lưu tên/múi giờ. `days` lưu ghi chép và trạng thái khép ngày. `tasks` lưu công việc trong từng ngày; `slot` chỉ nhận 1–3 và unique `(user_id,date,slot)` bảo vệ giới hạn ngay trong database. `reminder_settings` có ba lịch mặc định 06:00, 13:00, 20:30 theo `Asia/Ho_Chi_Minh`.

Chuyển việc giữ nguyên dòng ngày cũ và tạo dòng mới, liên kết bằng `previous_task_id` và `chain_id`, tăng `carry_count`. Một dòng chỉ có một lần chuyển tiếp. Khóa ngoại gồm UUID người dùng ngăn liên kết sang tài khoản khác. Từ hai lần chuyển, giao diện mời viết nguyên nhân; không suy đoán cảm xúc hoặc tự gắn nhãn. Không thể xóa dòng đã có hậu duệ để bảo toàn lịch sử.

Báo cáo chia số hoàn thành cho **số việc thực tế đã tạo** trong khoảng, kể cả kế hoạch ít hơn ba việc. Một việc chuyển ngày là một cam kết được ghi nhận trong từng ngày; các bản cũ chưa hoàn thành vẫn nằm trong tỷ lệ lịch sử. Danh sách chưa hoàn thành trong báo cáo khớp với số cam kết chưa hoàn thành trong khoảng và ghi rõ những việc đã chuyển tiếp. Danh sách gợi ý chuyển sang hôm nay và phần cần chú ý chỉ dùng đầu cuối chưa hoàn thành của chuỗi để không gợi ý lặp cùng việc. Ô “—” là chưa có kế hoạch; `0/2` là đã có hai việc, chưa hoàn thành việc nào. Ghi chép riêng không tạo mẫu số giả.

`mutation_receipts` chống lặp thao tác sau mất kết nối. `notification_jobs` chống gửi trùng theo tài khoản/loại nhắc/ngày địa phương; UUID job được gửi thành `idempotency_key` cho OneSignal. Hai bảng này không có quyền đọc/ghi cho client. Lease cho phép thử lại các lần gửi bị gián đoạn; khung nhắc giới hạn để không gửi nhắc cũ nhiều giờ sau.

## Lưu và đồng bộ

Supabase là nguồn chính. Khi đang đăng nhập, bản chụp và hàng đợi bản nháp được lưu theo khóa riêng chứa UUID tài khoản trong localStorage để không mất thay đổi khi mất mạng. Ghi được tuần tự hóa theo từng tài khoản ở máy chủ. Cùng một thay đổi được gửi lại với cùng mã thao tác nên không áp dụng hai lần.

Với nội dung công việc và ghi chép, client gửi giá trị cũ của trường đang sửa. Nếu giá trị đó đã thay đổi trên thiết bị khác, RPC báo xung đột. Ứng dụng giữ bản nháp và cho chọn dùng thay đổi trên thiết bị, tải lại dữ liệu đã lưu, hoặc xuất JSON trước. Thay đổi trạng thái hoàn thành không tự ghi đè nội dung công việc. Dữ liệu đọc lại khi ứng dụng nhận focus và mỗi phút đang mở; đây là cơ chế đồng bộ giao diện, không phải cơ chế gửi nhắc.

Trên trình duyệt dùng chung, nên đăng xuất sau khi đã đồng bộ. Đăng xuất gỡ liên kết push, đăng xuất phiên hiện tại và xóa bản chụp tài khoản trên thiết bị. Ứng dụng không cho bỏ qua bản nháp còn chờ mà không xử lý. Dữ liệu riêng tư không được lưu vào Service Worker Cache; cache chỉ chứa vỏ ứng dụng và SDK công khai.

Chế độ trải nghiệm dùng một khóa riêng, được gắn nhãn rõ ràng và không sao chép vào tài khoản. Không có phân tích AI hay nội dung nhật ký tự sinh trong tài khoản.

## Kiểm chứng đã chuẩn bị

- `npm test`: bảy kiểm tra ngày theo múi giờ, giao năm/DST, tuần bắt đầu thứ Hai, năm nhuận, mẫu số thật, chuỗi chuyển ngày, bản vá chờ lưu, URL thông báo trong thư mục con và chữ ký JWT.
- `npm run test:db`: migration chạy trên PostgreSQL; xác minh RLS hai tài khoản, chặn ghi trực tiếp, chặn tài khoản chưa xác minh, giới hạn ba việc, chống sửa chuỗi lịch sử, xung đột, chống lặp thao tác, đếm chuyển, giữ ngày cũ, chặn chuyển việc hoàn thành, múi giờ và chống trùng job. Bản local dùng PGlite; CI dùng PostgreSQL 16 độc lập.
- Kiểm tra trình duyệt: thêm/sửa/đánh dấu, tự động lưu, tải lại, ghi chép trước khi điều hướng, lịch tháng, chuyển việc và giới hạn ba vị trí, cài giờ nhắc, xuất JSON, đường dẫn PWA; kiểm tra tràn ngang ở 320/390/768/1024/1440 px.
- Kiểm tra dependencies bằng npm audit.

Các kiểm tra trên không thay thế thử với email thật, hai thiết bị thật và iPhone nhận OneSignal push. Không tuyên bố hoàn thành tích hợp dịch vụ trước khi có kết quả đó.

## Giới hạn MVP

Không khóa dữ liệu sau khi khép ngày; người dùng vẫn chỉnh sửa lịch sử. Không có cộng đồng, AI tâm lý, danh sách việc phụ hay quản lý mục tiêu dài hạn. Nhật ký tối đa 100.000 ký tự/ngày, tiêu đề việc tối đa 500 ký tự, nguyên nhân trì hoãn tối đa 5.000 ký tự. Khởi động và đăng nhập lần đầu cần mạng. Cache và bản nháp trên trình duyệt phụ thuộc dung lượng/quy tắc lưu trữ của thiết bị; xuất dữ liệu định kỳ nếu cần bản sao riêng.
