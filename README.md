# 3Dfrom2D

Phần mềm dựng mô hình 3D từ phác thảo 2D, theo kiểu SolidWorks: vẽ sketch trên mặt phẳng, rồi dùng Extrude / Revolve / Cut để tạo khối.

Chạy trên máy tính (Windows, macOS, Linux) qua Tauri; cùng mã nguồn sẽ được đóng gói cho điện thoại sau.

## Lộ trình

1. **Khung ứng dụng desktop**: khung nhìn 3D, 3 mặt phẳng chuẩn, Feature Tree, thanh công cụ. *(đã xong)*
2. **Sketch 2D**: vẽ line, rectangle, circle, arc trên mặt phẳng, nhập kích thước.
3. **Dựng 3D**: Extrude, Revolve, Cut (nhân hình học OpenCascade), sửa kích thước trong Feature Tree.
4. **Lưu / xuất file và điện thoại**: lưu dự án, xuất STL/STEP, bản Android thử nghiệm.

## Chạy thử

Cần [Node.js 22+](https://nodejs.org). Để chạy dạng phần mềm desktop cần thêm [Rust và các thư viện hệ thống của Tauri](https://tauri.app/start/prerequisites/).

```bash
npm install
npm run dev          # mở trong trình duyệt: http://localhost:1420
npm run tauri dev    # mở dạng cửa sổ phần mềm desktop
npm run tauri build  # tạo file cài đặt (.msi/.exe, .dmg, .deb/.AppImage)
```

Mỗi lần đẩy code lên GitHub, workflow **Desktop build** tự tạo file cài đặt cho Windows, macOS và Linux (xem tab Actions → Artifacts).

## Thao tác chuột

| Thao tác | Chuột | Cảm ứng |
| --- | --- | --- |
| Xoay | Kéo chuột trái hoặc giữa | Kéo 1 ngón |
| Di chuyển (pan) | Kéo chuột phải | Kéo 2 ngón |
| Zoom | Cuộn chuột | Chụm 2 ngón |
| Chọn mặt phẳng | Nhấp vào mặt phẳng hoặc trong Feature Tree | Chạm |

Phím tắt hướng nhìn: `1` Front, `5` Top, `3` Right, `0` Iso, `F` Fit, `G` bật/tắt lưới (mặc định tắt).
