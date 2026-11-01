# Việt Xô CSKH — Phần mềm chăm sóc khách hàng

Nha khoa Quốc tế Việt Xô. Dựng theo mô hình dữ liệu của source VietXO v1.0.3
(bệnh nhân, bác sĩ, dịch vụ, trạng thái lịch hẹn, nguồn khách, màu thương hiệu, logo).

## Chạy

Cần Node.js >= 18, không cần cài thêm thư viện.

```bash
node server.js
```

Mở http://localhost:3100 (đổi cổng: biến môi trường `PORT`).
Dữ liệu lưu trong `data/db.json` (tự tạo kèm dữ liệu mẫu ở lần chạy đầu; xóa file này để về dữ liệu mẫu).

## Chức năng

- **Tổng quan**: lịch hẹn hôm nay, 7 ngày tới, lịch cần nhắc/xác nhận, khách không đến/hủy cần chăm sóc lại.
- **Lịch hẹn**: lọc theo thời gian, bác sĩ, trạng thái.
- **Chăm sóc & tư vấn**: tìm kiếm toàn bộ nội dung chăm sóc, tư vấn, ghi chú.
- **Khách hàng**: hồ sơ + lịch sử chăm sóc theo thời gian.

## Trường dữ liệu mỗi lần chăm sóc

Mã BN · **Lịch hẹn** (khám/điều trị) · **Lịch hẹn tư vấn** · Bác sĩ · Dịch vụ · Trạng thái lịch hẹn ·
**Phiên dịch viên** · **Nội dung chăm sóc** · **Nội dung tư vấn** · **Ghi chú**.

## Bộ lọc & xuất Excel

- Lọc theo **mã BN**, **số điện thoại**, **khoảng ngày** (từ – đến) ở màn Lịch hẹn và Chăm sóc & tư vấn;
  mã BN + SĐT ở màn Khách hàng. "Loại lịch" chọn tính lịch khám, lịch tư vấn hoặc cả hai.
- Nút **Xuất Excel** xuất đúng danh sách đang hiển thị (đã áp bộ lọc) ra file `.xlsx`
  (dòng tiêu đề cố định, có bộ lọc sẵn). Mọi vai trò đều xuất được.

## Đồng bộ với website VietXO (source cũ)

Một chiều **website → CSKH**, chỉ đọc, dùng API của website: `POST /api/auth/login` rồi `GET /api/workspace`.
Đồng bộ bệnh nhân (giữ nguyên mã `BN-xxxxx`), lịch hẹn, bác sĩ, dịch vụ. Nội dung chăm sóc, tư vấn, phiên dịch,
lịch tư vấn và ghi chú do CSKH nhập **không bao giờ bị ghi đè**. Chạy lại nhiều lần không tạo bản ghi trùng.

Cấu hình bằng biến môi trường (không lưu vào file dữ liệu), dùng tài khoản admin/lễ tân của website:

```bash
VIETXO_URL=https://<tên-miền-website> VIETXO_EMAIL=<email> VIETXO_PASSWORD=<mật-khẩu> node server.js
```

Admin vào mục **Tài khoản & đồng bộ** bấm **Đồng bộ ngay**; hoặc đặt `SYNC_INTERVAL_MIN=15` để tự đồng bộ.
`VIETXO_URL` bắt buộc `https` (trừ localhost). Lưu ý: `/api/workspace` của website trả tối đa 250 bệnh nhân gần nhất.
Trùng mã BN với khách nhập tay khác người sẽ bị bỏ qua và báo số lượng xung đột.

Chưa kiểm thử với website thật (cần tài khoản của bạn); đã kiểm thử bằng server giả lập đúng API đó:
`node tools/mock-vietxo.mjs` (cổng 3200). Bản demo (`node --env-file=.demo.env server.js`) trỏ sẵn tới server giả lập.

Đã bỏ hoàn toàn trường **phụ tá** (không còn ở khách hàng, lịch hẹn hay bác sĩ).

## Đăng nhập & phân quyền

Lần chạy đầu tiên server tạo tài khoản `admin` với mật khẩu ngẫu nhiên, **in ra cửa sổ dòng lệnh một lần duy nhất**.
Đăng nhập, bấm "Đổi mật khẩu", rồi vào mục **Tài khoản** để tạo tài khoản cho nhân viên.
Quên mật khẩu admin: xóa mảng `users` trong `data/db.json` rồi chạy lại để tạo admin mới.

| Vai trò | Quyền |
|---|---|
| Quản trị | Toàn quyền, quản lý tài khoản |
| Chăm sóc khách hàng | Thêm/sửa/xóa khách hàng và lịch chăm sóc |
| Bác sĩ | Xem, thêm và sửa lịch/chăm sóc; không sửa hồ sơ khách, không xóa |

Bảo mật: mật khẩu băm scrypt; phiên 12 giờ lưu cookie HttpOnly + SameSite=Strict; khóa 5 phút sau 5 lần
đăng nhập sai; mọi thao tác ghi cần header chống CSRF; luôn còn ít nhất một quản trị hoạt động.

## Lưu ý

Server chỉ lắng nghe `127.0.0.1`. Dùng nhiều máy trong phòng khám cần đặt sau HTTPS (reverse proxy)
và thêm cờ `Secure` cho cookie trước khi mở ra mạng.
