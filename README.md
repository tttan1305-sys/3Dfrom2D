# 3Dfrom2D

Phần mềm dựng mô hình 3D từ phác thảo 2D, theo kiểu SolidWorks: vẽ sketch trên mặt phẳng, rồi dùng Extrude / Revolve / Cut để tạo khối.

Chạy trên máy tính (Windows, macOS, Linux) qua Tauri; cùng mã nguồn sẽ được đóng gói cho điện thoại sau.

## Lộ trình

1. **Khung ứng dụng desktop**: khung nhìn 3D, 3 mặt phẳng chuẩn (mặt đứng, mặt bằng, mặt cạnh), Feature Tree, thanh công cụ. *(đã xong)*
2. **Sketch 2D**: vẽ line, rectangle, circle, arc trên mặt phẳng, nhập kích thước. *(đã xong)*
3. **Dựng 3D**: Extrude, Revolve, Cut (nhân hình học OpenCascade), sửa kích thước trong Feature Tree.
4. **Lưu / xuất file và điện thoại**: lưu dự án, xuất STL/STEP, bản Android thử nghiệm.

## Dùng thử không cần cài

Bản web luôn cập nhật theo nhánh `main`: https://tttan1305-sys.github.io/3Dfrom2D/

## Chạy thử

Cần [Node.js 22+](https://nodejs.org). Để chạy dạng phần mềm desktop cần thêm [Rust và các thư viện hệ thống của Tauri](https://tauri.app/start/prerequisites/).

```bash
npm install
npm run dev          # mở trong trình duyệt: http://localhost:1420
npm run tauri dev    # mở dạng cửa sổ phần mềm desktop
npm run tauri build  # tạo file cài đặt (.msi/.exe, .dmg, .deb/.AppImage)
```

Mỗi lần đẩy code lên GitHub, workflow **Desktop build** tự tạo file cài đặt cho Windows, macOS và Linux (xem tab Actions → Artifacts).

## Vẽ Sketch

1. Chọn một mặt phẳng (mặt đứng, mặt bằng, mặt cạnh) rồi bấm **Sketch**.
2. Chọn lệnh vẽ, nhấp các điểm trên màn hình. Trong lúc vẽ có thể **gõ số rồi Enter** để nhập kích thước chính xác:

| Lệnh | Phím | Cách vẽ | Gõ số |
| --- | --- | --- | --- |
| Line | `L` | Nhấp điểm đầu, các điểm tiếp theo (nối liền). Nhấp phải / Esc / nhấp đúp để dừng | `dài` hoặc `dài,góc` |
| Rectangle | `R` | Nhấp 2 góc đối diện | `rộng,cao` |
| Circle | `C` | Nhấp tâm, rồi một điểm trên đường tròn | `đường kính` |
| Arc | `A` | Nhấp tâm, điểm đầu, điểm cuối (ngược chiều kim đồng hồ) | `bán kính`, rồi `góc quét` |
| Chọn | `S` | Nhấp vào nét để sửa tọa độ và kích thước ở bảng bên trái | |

- Con trỏ tự bắt vào đầu mút, góc, tâm, trung điểm và gốc tọa độ; Line tự bắt ngang/dọc.
- `Delete` xóa nét đang chọn, `Ctrl+Z` / `Ctrl+Y` hoàn tác / làm lại, `Ctrl+Enter` thoát Sketch.
- Bản vẽ được tự lưu trên máy; nhấp tên Sketch trong cây để sửa lại.

## Tự động cập nhật

Phần mềm desktop tự kiểm tra bản mới khi mở. Nếu có, nút xanh **⬆ Cập nhật lên vX** hiện trên thanh công cụ: bấm để tải, cài và khởi động lại.

Phát hành bản mới: vào tab **Actions → Release (auto-update) → Run workflow**, gõ số phiên bản (ví dụ `0.2.0`). Workflow build cho Windows, macOS, Linux, ký số gói cập nhật và tạo GitHub Release.

Cần một lần thiết lập: thêm secret `TAURI_SIGNING_PRIVATE_KEY` (Settings → Secrets and variables → Actions) chứa khóa ký cập nhật. Giữ kỹ khóa này: mất khóa thì các bản đã cài không nhận cập nhật được nữa.

## Thao tác chuột

| Thao tác | Chuột | Cảm ứng |
| --- | --- | --- |
| Xoay (ngoài Sketch) | Kéo chuột trái hoặc giữa | Kéo 1 ngón |
| Di chuyển (pan) | Kéo chuột phải | Kéo 2 ngón |
| Zoom | Cuộn chuột | Chụm 2 ngón |
| Chọn mặt phẳng | Nhấp vào mặt phẳng hoặc trong Feature Tree | Chạm |

Phím tắt hướng nhìn: `1` Đứng, `5` Bằng, `3` Cạnh, `0` Iso, `F` Fit, `G` bật/tắt lưới (mặc định tắt).
