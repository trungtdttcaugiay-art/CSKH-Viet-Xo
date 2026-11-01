// Giả lập API của website VietXO cũ (login + workspace) để demo/kiểm thử đồng bộ mà không cần MongoDB.
// Chạy: node tools/mock-vietxo.mjs   (cổng 3200). Tài khoản giả: demo@vietxo.test / demo-only
import http from "node:http";

const PORT = Number(process.env.MOCK_PORT || 3200);
const iso = (days, h, m) => { const d = new Date(); d.setDate(d.getDate() + days); d.setHours(h, m, 0, 0); return d.toISOString(); };

const doctors = [
  { id: "BS-001", name: "BS. Phạm Thu Hà", specialty: "Nội nha · Thẩm mỹ" },
  { id: "BS-002", name: "BS. Đỗ Anh Tuấn", specialty: "Implant · Tiểu phẫu" },
  { id: "BS-009", name: "BS. Hoàng Văn Bình", specialty: "Nha chu" },
];
const services = [
  { id: "DV-001", name: "Khám tổng quát" },
  { id: "DV-101", name: "Cấy ghép Implant All-on-4" },
  { id: "DV-102", name: "Điều trị nha chu" },
];
const patients = [
  { id: "BN-02451", name: "Nguyễn Minh Anh", phone: "0914 886 220", gender: "Nữ", birthYear: 1992, doctorId: "BS-001", status: "Đang điều trị", note: "Dị ứng Lidocaine." },
  { id: "BN-02437", name: "Ngô Mỹ Duyên", phone: "0909 332 806", gender: "Nữ", birthYear: 2001, doctorId: "BS-002", status: "Mới", note: "" },
  { id: "BN-02309", name: "Võ Thị Ngọc Mai", phone: "0938 142 907", gender: "Nữ", birthYear: 1985, doctorId: "BS-002", status: "Đang điều trị", note: "" },
  { id: "BN-02501", name: "Trần Văn Hùng", phone: "0977 245 610", gender: "Nam", birthYear: 1975, doctorId: "BS-009", status: "Tái khám", note: "" },
];
const appointments = [
  { id: "LH-9001", patientId: "BN-02451", startAt: iso(0, 16, 30), doctorId: "BS-001", serviceId: "DV-001", status: "confirmed", note: "Khám định kỳ" },
  { id: "LH-9002", patientId: "BN-02437", startAt: iso(1, 9, 0), doctorId: "BS-002", serviceId: "DV-101", status: "scheduled", note: "" },
  { id: "LH-9003", patientId: "BN-02309", startAt: iso(2, 14, 0), doctorId: "BS-002", serviceId: "DV-101", status: "confirmed", note: "" },
  { id: "LH-9004", patientId: "BN-02501", startAt: iso(4, 10, 30), doctorId: "BS-009", serviceId: "DV-102", status: "scheduled", note: "" },
  { id: "LH-9005", patientId: "BN-02501", startAt: iso(-3, 10, 0), doctorId: "BS-009", serviceId: "DV-102", status: "completed", note: "" },
];

const json = (res, status, body, headers = {}) => { res.writeHead(status, { "Content-Type": "application/json", ...headers }); res.end(JSON.stringify(body)); };
const TOKEN = "mock-session-token";

http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://x");
  if (url.pathname === "/api/auth/login" && req.method === "POST") {
    if (req.headers.origin !== `http://${req.headers.host}`) return json(res, 403, { error: "Origin không hợp lệ." });
    let raw = ""; for await (const c of req) raw += c;
    const b = JSON.parse(raw || "{}");
    if (b.email !== "demo@vietxo.test" || b.password !== "demo-only") return json(res, 401, { error: "Email hoặc mật khẩu không chính xác." });
    return json(res, 200, { user: { role: "admin" }, sessionToken: TOKEN }, { "Set-Cookie": `vietxo_session=${TOKEN}; HttpOnly; Path=/` });
  }
  if (url.pathname === "/api/workspace" && req.method === "GET") {
    if (!(req.headers.cookie || "").includes(`vietxo_session=${TOKEN}`)) return json(res, 401, { error: "Chưa đăng nhập." });
    return json(res, 200, { doctors, services, patients, appointments, serverTime: new Date().toISOString() });
  }
  json(res, 404, { error: "API endpoint not found." });
}).listen(PORT, "127.0.0.1", () => console.log(`Mock VietXO API: http://127.0.0.1:${PORT}`));
