# Kịch bản kiểm thử thủ công OmniScribe AI

Tài liệu này dùng để tự kiểm tra toàn bộ luồng từ chọn ảnh, OCR, kiểm bản Markdown đến lưu Obsidian. Mỗi kịch bản có thể được đánh dấu trực tiếp bằng ô `[ ]`.

## 1. Chuẩn bị

### Môi trường mặc định

1. Sao chép cấu hình mẫu nếu chưa có:

   ```powershell
   Copy-Item .env.example backend\.env
   ```

2. Trong `backend/.env`, dùng cấu hình an toàn:

   ```env
   DEMO_MODE=true
   DEMO_ALLOW_VAULT_WRITE=false
   ```

3. Chạy backend:

   ```powershell
   cd backend
   python -m uvicorn main:app --reload --port 8000
   ```

4. Trong cửa sổ PowerShell khác, chạy frontend:

   ```powershell
   cd frontend
   npm.cmd run dev
   ```

5. Mở `http://localhost:5173`.

### Dữ liệu kiểm thử

- `test-note.jpg`: ảnh hợp lệ có sẵn trong repo.
- Một ảnh PNG hợp lệ bất kỳ.
- Một file TXT hoặc PDF để kiểm tra định dạng không hỗ trợ.
- Một file lớn hơn 10 MB để kiểm tra giới hạn dung lượng.
- Tám bản sao ảnh hợp lệ để kiểm tra giới hạn và sắp xếp nhiều trang.

### Quy ước ghi kết quả

- **Đạt:** kết quả thực tế khớp toàn bộ kết quả mong đợi.
- **Không đạt:** ghi lại bước lỗi, nội dung thông báo và ảnh chụp màn hình nếu cần.
- Không dùng dữ liệu nhạy cảm hoặc vault Obsidian thật khi kiểm tra lỗi ghi file.

---

## 2. Khởi động và trạng thái hệ thống

### TC-01 — Mở ứng dụng ở demo mode

- [ ] Mở `/` khi cả backend và frontend đang chạy.

Kết quả mong đợi:

- Workstation ba cột xuất hiện.
- Header hiển thị `Chế độ demo`, pha `Chưa bắt đầu`, `0/0` trang và `0%`.
- Cột giữa mặc định là `OCR Markdown trực tiếp`.
- Có thông báo demo, không có thông số model, memory, accuracy hoặc người dùng giả.
- Không có lỗi đỏ trong giao diện.

### TC-02 — Backend offline

- [ ] Dừng backend nhưng giữ frontend đang chạy.
- [ ] Tải lại `/`.
- [ ] Chọn một ảnh hợp lệ.

Kết quả mong đợi:

- Header và cột nguồn hiển thị `Backend offline` bằng cả chữ và trạng thái màu.
- Nút bắt đầu số hóa bị vô hiệu hóa.
- Ảnh vẫn xuất hiện trong hàng đợi và có thể xóa hoặc sắp xếp.
- Sau khi chạy lại backend và tải lại trang, trạng thái offline biến mất.

### TC-03 — Trạng thái upload rỗng

- [ ] Mở `/` khi chưa chọn ảnh.

Kết quả mong đợi:

- Hàng đợi hiển thị trạng thái rỗng và hướng dẫn bước tiếp theo.
- Console, metadata và graph hiển thị trạng thái chờ trung thực.
- Các field metadata và nút lưu Obsidian bị vô hiệu hóa.
- Nút bắt đầu số hóa bị vô hiệu hóa.

---

## 3. Chọn và quản lý ảnh

### TC-04 — Chọn một ảnh JPG hợp lệ

- [ ] Chọn `test-note.jpg`.

Kết quả mong đợi:

- Hàng đợi có đúng một trang với folio `01`.
- Hiển thị thumbnail, tên file, dung lượng và trạng thái chờ.
- Header hiển thị `0/1` trang.
- Nút bắt đầu số hóa được bật khi backend online.

### TC-05 — Chọn đồng thời JPG và PNG

- [ ] Chọn một JPG và một PNG hợp lệ.

Kết quả mong đợi:

- Cả hai file được chấp nhận.
- Thứ tự hàng đợi khớp thứ tự chọn file.
- Header và nút bắt đầu hiển thị hai trang.

### TC-06 — Từ chối định dạng không hỗ trợ

- [ ] Chọn file TXT, PDF hoặc file khác không phải JPG/PNG.
- [ ] Thử đổi phần mở rộng của file TXT thành `.jpg` rồi upload.

Kết quả mong đợi:

- Frontend từ chối định dạng không hỗ trợ với thông báo nêu tên file.
- File giả JPG có thể qua bước kiểm tra phía trình duyệt nhưng backend phải từ chối vì magic bytes không hợp lệ.
- Không tạo job mới khi upload không hợp lệ.

### TC-07 — Từ chối ảnh lớn hơn 10 MB

- [ ] Chọn một file JPG hoặc PNG có dung lượng lớn hơn 10 MB.

Kết quả mong đợi:

- Hiển thị thông báo file vượt giới hạn 10 MB.
- File không được thêm vào hàng đợi.
- Các file hợp lệ đã chọn trước đó không bị mất.

### TC-08 — Giới hạn tối đa tám ảnh

- [ ] Chọn tám ảnh hợp lệ.
- [ ] Thử thêm ảnh thứ chín.

Kết quả mong đợi:

- Tám ảnh đầu xuất hiện với folio `01` đến `08`.
- Ảnh thứ chín bị từ chối với thông báo giới hạn tám ảnh.
- Hàng đợi vẫn giữ nguyên tám ảnh ban đầu.

### TC-09 — Sắp xếp bằng nút mũi tên

- [ ] Chọn ít nhất ba ảnh có tên khác nhau.
- [ ] Dùng nút lên và xuống để thay đổi thứ tự.

Kết quả mong đợi:

- Hàng đợi đổi thứ tự ngay lập tức.
- Folio được đánh lại theo vị trí mới.
- Nút lên của trang đầu và nút xuống của trang cuối bị vô hiệu hóa.
- Tên file đầy đủ vẫn có trong accessible name hoặc tooltip.

### TC-10 — Sắp xếp bằng kéo thả

- [ ] Kéo trang cuối lên vị trí đầu.

Kết quả mong đợi:

- Trang được thả đúng vị trí.
- Không tạo bản sao và không mất trang.
- Thứ tự này được dùng làm thứ tự tài liệu khi bắt đầu OCR.

### TC-11 — Xóa trang

- [ ] Chọn ít nhất ba ảnh.
- [ ] Xóa trang giữa.

Kết quả mong đợi:

- Chỉ trang được chọn bị xóa.
- Các trang còn lại được đánh lại folio liên tục.
- Số trang trong header và nhãn nút bắt đầu được cập nhật.

---

## 4. OCR và console trực tiếp

### TC-12 — Xử lý một trang trong demo mode

- [ ] Chọn một ảnh và bấm `Bắt đầu số hóa`.

Kết quả mong đợi:

- URL chuyển sang `/jobs/:jobId`.
- Cột nguồn trở thành thông tin job chỉ đọc; không có nút thêm trang vào job.
- Pipeline lần lượt chuyển qua nhận trang, GLM OCR, tổ chức nội dung và kiểm tra bản nháp.
- Console vẫn ở chế độ `Markdown`, không tự chuyển sang preview khi hoàn tất.
- Markdown có gutter số dòng cobalt.

### TC-13 — Xử lý nhiều trang

- [ ] Chọn từ hai đến tám ảnh rồi bắt đầu số hóa.

Kết quả mong đợi:

- Hàng đợi job hiển thị từng trạng thái: chờ, đang OCR, đã xong hoặc lỗi.
- Header hiển thị số trang đã xử lý, tổng trang và phần trăm thực.
- Mỗi trang có một section `PAGE xx` trong console.
- Nội dung cuối cùng giữ đúng thứ tự upload, không phụ thuộc thứ tự trang hoàn tất OCR.

### TC-14 — Placeholder trong lúc xử lý

Kịch bản này dễ quan sát hơn khi dùng API thật hoặc ảnh có thời gian OCR dài.

- [ ] Bắt đầu job nhiều trang.
- [ ] Quan sát console trước khi tất cả trang hoàn tất.

Kết quả mong đợi:

- Trang chưa bắt đầu có placeholder chờ.
- Trang đang OCR có placeholder xử lý.
- Khi `page.ocr_completed` đến, placeholder của đúng trang được thay bằng Markdown hoàn chỉnh.
- Không xuất hiện hiệu ứng giả lập gõ từng token.

### TC-15 — Chọn trang từ hàng đợi

- [ ] Trong chế độ Markdown, chọn trang thứ hai.
- [ ] Chuyển sang `Ảnh gốc`, sau đó chọn trang khác.

Kết quả mong đợi:

- Trong Markdown, console cuộn tới section tương ứng.
- Trong Ảnh gốc, ảnh và caption chuyển đúng sang trang vừa chọn.
- Hàng đợi thể hiện rõ trang đang chọn.

### TC-16 — Chuyển chế độ xem

- [ ] Lần lượt chọn `Markdown`, `Ảnh gốc`, `Xem trước` và `Chỉnh sửa`.

Kết quả mong đợi:

- Markdown hiển thị raw source có số dòng.
- Ảnh gốc giữ đúng tỷ lệ và không bị crop.
- Xem trước render heading, danh sách, bảng và công thức nếu có.
- Chỉnh sửa bị khóa trước `document.ready` và được bật sau khi tài liệu sẵn sàng.
- Nút đang chọn có trạng thái active rõ ràng.

### TC-17 — Lỗi OCR một phần (nâng cao)

Điều kiện: backend thật hoặc stub phải trả `page.ocr_failed` cho đúng một trang và thành công cho ít nhất một trang khác.

- [ ] Chạy job có một trang thành công và một trang thất bại.

Kết quả mong đợi:

- Job vẫn tiếp tục tới trạng thái sẵn sàng nếu còn ít nhất một trang thành công.
- Trang lỗi có trạng thái `Lỗi`, thông báo cụ thể và error block trong Markdown.
- Các trang thành công không bị mất.
- Metadata và export vẫn dùng được cho bản tài liệu một phần.

### TC-18 — Tất cả trang OCR thất bại (nâng cao)

Điều kiện: backend thật hoặc stub trả lỗi cho tất cả trang.

- [ ] Chạy job mà không trang nào OCR thành công.

Kết quả mong đợi:

- Job chuyển sang trạng thái cần kiểm tra/lỗi.
- Giao diện hiển thị nguyên nhân, không bật edit hoặc save.
- Pipeline thể hiện bị gián đoạn bằng chữ, không chỉ bằng màu.

---

## 5. Metadata và knowledge graph

### TC-19 — Metadata trước và sau khi ready

- [ ] Quan sát metadata ngay sau khi mở job.
- [ ] Chờ `document.ready`.

Kết quả mong đợi:

- Trước ready: field bị khóa và có trạng thái chờ.
- Sau ready: title, summary, document type, category, tags và topics có thể chỉnh sửa.
- Không xuất hiện field ngoài schema hiện tại.

### TC-20 — Chỉnh sửa metadata

- [ ] Sửa tiêu đề và tóm tắt.
- [ ] Nhập tags và topics cách nhau bằng dấu phẩy.

Kết quả mong đợi:

- Giá trị không bị mất khi chuyển qua lại giữa các chế độ xem.
- Graph gửi lại request sau 400 ms và cập nhật từ Markdown/metadata vừa sửa.
- Document hiện tại là tiêu điểm trực quan; category, note liên quan, topics và tags nằm trong cùng một force-simulation world ổn định theo node ID.
- Request cũ bị hủy và response cũ không được ghi đè graph mới.
- Tags được giới hạn ở ba giá trị chủ đạo đầu tiên.

### TC-21 — Hybrid local graph và depth

- [ ] Tạo note A liên kết trực tiếp tới note B; note B liên kết tới note C trong một graph root được phép.
- [ ] Mở graph ở depth 1, sau đó chuyển sang depth 2.
- [ ] Tắt rồi bật `Hiện tags`, sau đó tải lại trang.

Kết quả mong đợi:

- Depth 1 có A/B và các note cùng category; depth 2 bổ sung C.
- Node trùng được loại bỏ; kích thước node tăng theo degree nhưng không vượt giới hạn.
- Tùy chọn depth và tags được khôi phục từ localStorage.

### TC-22 — Tương tác graph

- [ ] Bấm `Mở graph`, rồi kéo một node sang vị trí khác.
- [ ] Chuyển `Local / Global`, đổi depth 1/2 và bật/tắt từng type filter.
- [ ] Kéo vùng nền để pan toàn graph.
- [ ] Zoom bằng con lăn và bằng nút `+`/`−`.
- [ ] Hover node để kiểm tra neighborhood highlight; click node để mở detail.
- [ ] Dùng `Tab`, `Enter`, `Escape` để mở/chọn/đóng dialog.
- [ ] Bấm `Đặt lại`.

Kết quả mong đợi:

- Node đi theo con trỏ và cạnh nối cập nhật tức thời.
- Pan và zoom không làm mất node hoặc tạo thanh cuộn ngang toàn trang.
- Hover làm mờ node không liên quan; detail hiển thị degree, trạng thái, path tương đối và link Obsidian khi có.
- Search không phân biệt hoa thường/dấu; filter Notes/Chủ đề/Tags ẩn cả node lẫn cạnh không còn đủ endpoint.
- Preview B2 hiển thị toàn bộ depth-1 neighborhood quanh document, cho phép drag/pan và không chiếm wheel scroll của trang.
- Compact và Explorer dùng cùng world coordinates; mở dialog, đổi mode, filter, search, resize hoặc selection không khởi tạo lại physics.
- Local dùng BFS depth 1/2 quanh selected node; Global hiển thị toàn bộ graph response. Node bị filter ẩn vẫn ở trong simulation.
- Current/category/selected/hovered luôn có label; zoom thấp/vừa/cao lần lượt mở thêm neighborhood, high-degree nodes và toàn bộ label phù hợp.
- Escape đóng dialog và focus trở lại nút `Mở graph`.
- Vừa khung/Đặt lại chỉ đổi camera, không đổi force distance hoặc world positions.
- Mobile dialog chiếm toàn màn hình; resize không tạo overflow ngang toàn trang.

### TC-22A — Persistent physics contract

- [x] Reconcile graph object mới với cùng node IDs giữ nguyên world coordinates.
- [x] Node mới seed cạnh neighbor bằng góc hash ổn định; node bị xóa không để stale link.
- [x] Manual ticks cho fixtures 8/30/80 node không để glyph hoặc label footprint chồng nhau sau settle.
- [x] Drag làm direct neighbor dịch chuyển nhiều hơn unrelated node; release tiếp tục chuyển động rồi settle.
- [x] Edge route cắt ở biên glyph và dùng quadratic path ổn định khi straight path gặp node/label khác.

### TC-23 — Graph rỗng

- [ ] Mở route upload hoặc quan sát graph trước khi metadata sẵn sàng.

Kết quả mong đợi:

- Graph không tạo node giả.
- Empty state giải thích graph sẽ dùng document hiện tại làm tiêu điểm, cùng category, topics và tối đa ba tags.
- Screen reader có fallback dạng text/list khi graph có dữ liệu.

### TC-24 — Vault graph fallback

- [ ] Cấu hình `VAULT_GRAPH_ROOTS` tới thư mục không tồn tại hoặc tạm thời làm vault không đọc được.

Kết quả mong đợi:

- Review Markdown/metadata vẫn hoạt động.
- Graph metadata cục bộ vẫn hiển thị cùng cảnh báo cụ thể.
- Response không chứa absolute vault path hay nội dung note.

### TC-25 — Migration category links

- [ ] Chạy `python backend/scripts/migrate_category_links.py --dry-run` trên vault thử nghiệm.
- [ ] Xác nhận không có file đổi rồi chạy lại với `--apply`.
- [ ] Chạy `--apply` lần thứ hai.

Kết quả mong đợi:

- Chỉ note dưới `OmniScribe/Inbox` có `source: handwritten` được chọn.
- Dry-run không ghi file; apply tạo category note/link và backup theo timestamp.
- Category note có sẵn không bị ghi đè; lần apply thứ hai không nhân đôi section/link.

---

## 6. Chỉnh sửa và lưu Obsidian

### TC-26 — Chỉnh sửa Markdown

- [ ] Chờ tài liệu ready rồi mở `Chỉnh sửa`.
- [ ] Thêm một heading hoặc đoạn văn.
- [ ] Chuyển sang `Xem trước`.

Kết quả mong đợi:

- Textarea có ranh giới rõ ràng và dùng font mono.
- Nội dung mới xuất hiện trong preview.
- Quay lại chỉnh sửa vẫn giữ nội dung vừa nhập.

### TC-27 — Không cho lưu khi title rỗng

- [ ] Xóa toàn bộ title.

Kết quả mong đợi:

- Nút `Lưu vào Obsidian` bị vô hiệu hóa.
- Nhập lại title sẽ bật nút lưu.

### TC-28 — Export thành công trong demo mode

- [ ] Giữ `DEMO_MODE=true` và `DEMO_ALLOW_VAULT_WRITE=false`.
- [ ] Bấm `Lưu vào Obsidian`.

Kết quả mong đợi:

- Giao diện hiển thị `Đã lưu vào vault` cùng đường dẫn note thật.
- Output nằm trong `backend/demo-vault/`, không ghi vào vault thật.
- Note chứa Markdown đã chỉnh sửa và metadata cuối.
- Ảnh nguồn của mọi trang được lưu cùng output.
- Topic notes/link được tạo theo exporter hiện tại.
- Category note được tạo nếu thiếu, note chính có section `Danh mục`, và category note có sẵn không bị ghi đè.

### TC-29 — Export thất bại (nâng cao)

Điều kiện: dùng một vault thử nghiệm không có quyền ghi hoặc mock endpoint export trả lỗi. Không dùng vault thật.

- [ ] Bấm lưu khi đích ghi không khả dụng.

Kết quả mong đợi:

- Hiển thị thông báo lỗi cụ thể và có thể đọc được.
- Markdown và metadata đang chỉnh sửa không bị mất.
- Job trở lại trạng thái ready để có thể thử lưu lại.
- Không hiển thị thành công giả hoặc đường dẫn note giả.

### TC-30 — Export lặp lại

- [ ] Sau khi export thành công, thử mở lại deep link và kiểm tra khu vực Obsidian.

Kết quả mong đợi:

- Trạng thái đã lưu và đường dẫn note được khôi phục từ snapshot.
- Không xuất hiện nút lưu trùng làm người dùng tưởng cần export lại.

---

## 7. Reload, deep link và mất kết nối

### TC-31 — Reload job đang xử lý

Kịch bản này dễ kiểm tra với API thật hoặc job nhiều trang.

- [ ] Tải lại `/jobs/:jobId` khi OCR đang chạy.

Kết quả mong đợi:

- Snapshot dựng lại đúng queue và Markdown đã hoàn tất.
- SSE tiếp tục từ event ID gần nhất, không nhân đôi nội dung trang.
- Progress không lùi về 0 nếu backend đã xử lý trang.

### TC-32 — Reload job ready hoặc exported

- [ ] Tải lại một job đã ready.
- [ ] Tải lại một job đã export.

Kết quả mong đợi:

- Markdown mặc định vẫn là raw mode.
- Metadata và graph được dựng lại đúng.
- Job exported khôi phục đúng đường dẫn note và trạng thái đã lưu.

### TC-33 — Deep link không tồn tại

- [ ] Mở `/jobs/id-khong-ton-tai`.

Kết quả mong đợi:

- Hiển thị màn hình không thể mở tài liệu.
- Có thông báo dễ hiểu và nút quay về upload.
- Không để màn hình loading vô hạn.

### TC-34 — SSE mất kết nối tạm thời (nâng cao)

- [ ] Trong khi job đang chạy, tạm ngắt mạng hoặc dừng backend.
- [ ] Khôi phục kết nối.

Kết quả mong đợi:

- Giao diện thông báo đang đồng bộ lại.
- Khi backend trở lại, snapshot và SSE khôi phục trạng thái hiện tại.
- Không mất Markdown đã nhận và không nhân đôi section.

---

## 8. Responsive và accessibility

Không cần công cụ tự động; thay đổi kích thước cửa sổ trình duyệt bằng tay.

### TC-35 — Desktop từ 1200px

- [ ] Kiểm tra ở cửa sổ rộng từ 1200px trở lên.

Kết quả mong đợi:

- Hiển thị đủ ba cột theo tỷ lệ gần 24/47/29.
- Console là vùng lớn nhất.
- Header không hiển thị dữ liệu giả.
- Không có thanh cuộn ngang toàn trang.

### TC-36 — Tablet từ 800px đến 1199px

- [ ] Thu cửa sổ vào khoảng 1024px.
- [ ] Bấm nút `Metadata`.
- [ ] Đóng drawer bằng nút đóng và scrim.

Kết quả mong đợi:

- Cột trái rộng khoảng 240px, console chiếm phần còn lại.
- Inspector mở thành drawer, không đè mất khả năng đóng.
- Có thể mở và đóng drawer bằng bàn phím.
- Không có thanh cuộn ngang toàn trang.

### TC-37 — Mobile dưới 800px

- [ ] Thu cửa sổ xuống khoảng 390px.

Kết quả mong đợi:

- Thứ tự hiển thị: console, nguồn/queue, metadata/graph/save.
- Queue cuộn ngang bên trong chính nó.
- Trang không có thanh cuộn ngang toàn cục.
- Không có vùng cuộn dọc lồng nhau hoặc chiều cao viewport cố định.
- Controls vẫn đủ lớn để chạm.

### TC-38 — Điều hướng bằng bàn phím

- [ ] Không dùng chuột; dùng `Tab`, `Shift+Tab`, `Enter` và `Space`.
- [ ] Chọn ảnh, sắp xếp bằng nút, chuyển view, chọn page, sửa metadata và mở drawer.

Kết quả mong đợi:

- Mọi control có thể focus và kích hoạt.
- Focus ring amber rõ ràng, không bị cắt.
- Thứ tự focus hợp lý theo thứ tự đọc.
- Control disabled không nhận thao tác.

### TC-39 — Trạng thái không phụ thuộc màu

- [ ] Kiểm tra backend, page queue, pipeline, lỗi và export success.

Kết quả mong đợi:

- Mỗi trạng thái đều có chữ và/hoặc icon ngoài màu sắc.
- Không cần phân biệt đỏ, xanh hoặc amber mới hiểu được trạng thái.

### TC-40 — Reduced motion

- [ ] Bật `Reduce motion` trong hệ điều hành hoặc giả lập `prefers-reduced-motion: reduce` trong DevTools.
- [ ] Chạy một job OCR.

Kết quả mong đợi:

- Scan animation bị tắt.
- Drawer và progress gần như chuyển trạng thái tức thì.
- Trạng thái xử lý vẫn thể hiện bằng chữ, lamp và số progress.

### TC-41 — Nội dung dài

- [ ] Dùng filename dài, title dài, nhiều tags/topics và Markdown có bảng rộng.

Kết quả mong đợi:

- Filename truncate trong UI nhưng vẫn truy cập được tên đầy đủ.
- Text không đè lên controls.
- Bảng chỉ cuộn ngang trong vùng preview nếu cần.
- Toàn trang không phát sinh horizontal overflow.

### TC-42 — Marker phân trang nội bộ

- [ ] Mở tài liệu có ít nhất hai trang ở chế độ Markdown, Xem trước và Chỉnh sửa.

Kết quả mong đợi:

- Không chế độ nào hiển thị `<!-- page:1 -->`, `<!-- page:2 -->` hoặc marker tương tự.
- Hàng đợi trang vẫn chọn và cuộn tới đúng section trong chế độ Markdown.
- Nội dung OCR và định dạng Markdown không bị thay đổi khi marker được ẩn.

### TC-43 — Chuyển ngôn ngữ VI/EN

- [ ] Nhấn `EN` trên header, kiểm tra các panel, pipeline, toolbar, metadata và graph.
- [ ] Tải lại trang, sau đó nhấn `VI`.
- [ ] Kiểm tra ở desktop, tablet và mobile.

Kết quả mong đợi:

- Nhãn giao diện chuyển giữa tiếng Việt và tiếng Anh ngay lập tức.
- Nội dung OCR, tiêu đề và metadata của tài liệu không bị dịch.
- Lựa chọn ngôn ngữ được giữ sau khi tải lại.
- Toggle dùng được bằng bàn phím và không tạo horizontal overflow.

---

## 9. Kiểm tra tự động bổ sung

Sau khi hoàn thành manual test, chạy:

```powershell
cd frontend
npm.cmd run design:lint
npm.cmd run test
npm.cmd run lint
npm.cmd run build

cd ..\backend
python -m unittest discover -s tests -v
```

Kết quả mong đợi:

- Design lint: `0 error`, `0 warning`.
- Frontend unit tests, lint và build thành công.
- Backend test suite thành công.
- Vite có thể hiển thị chunk-size warning hiện tại; warning này không làm build thất bại.

---

## 10. Mẫu báo cáo lỗi

```text
Test case:
Kết quả: Đạt / Không đạt
Môi trường: Demo / API thật
Trình duyệt và kích thước cửa sổ:
Dữ liệu đầu vào:
Bước xảy ra lỗi:
Kết quả thực tế:
Kết quả mong đợi:
Thông báo lỗi:
Ảnh chụp hoặc file liên quan:
```
