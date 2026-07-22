# Brief tạo DOCX thuyết trình — Hybrid Local Graph cho OmniScribe AI

## 1. Thông tin chung

- **Tên sản phẩm:** OmniScribe AI
- **Tên tính năng:** Hybrid Local Graph
- **Mục tiêu sản phẩm:** Chuyển ảnh ghi chú viết tay thành Markdown, cho phép người dùng kiểm bản, chỉnh sửa metadata và lưu thành hệ thống ghi chú liên kết trong Obsidian.
- **Đối tượng sử dụng:** Sinh viên, giảng viên, người nghiên cứu và người quản lý knowledge base bằng Obsidian.
- **Định hướng giao diện:** Retro workstation, rõ ràng và thiên về công cụ làm việc; không sao chép giao diện trực quan của Obsidian.

## 2. Bài toán trước khi cải tiến

Graph Preview cũ chỉ được dựng từ metadata của tài liệu hiện tại:

- Category.
- Tiêu đề.
- Topics.
- Tối đa ba tags.

Graph này có ích để minh họa metadata nhưng chưa phản ánh knowledge graph thật trong vault. Người dùng không thấy được:

- Những note đã liên kết với tài liệu.
- Các note cùng category.
- Liên kết gián tiếp giữa các note.
- Trạng thái note nào thực sự tồn tại trong vault.
- Khả năng mở và khám phá note liên quan trong Obsidian.

## 3. Mục tiêu của Hybrid Local Graph

Tính năng mới kết hợp dữ liệu đang kiểm bản với các note thật trong những thư mục vault được cho phép.

Graph bao gồm:

- Category làm trung tâm ngữ nghĩa.
- Tài liệu hiện tại.
- Topic notes.
- Tags.
- Các note được tài liệu liên kết trực tiếp.
- Các note cùng category.
- Liên kết cấp hai khi người dùng chọn depth 2.

Những nguyên tắc được giữ cố định:

- Category luôn là semantic center và được ghim ở giữa canvas.
- Tags vẫn giới hạn ở ba giá trị chủ đạo.
- Mặc định chỉ index thư mục `OmniScribe`.
- Backend không tự động thay đổi các note cũ.
- Không triển khai global graph, search syntax, custom groups, force sliders, context menu hoặc time-lapse trong phiên bản này.

## 4. Trải nghiệm người dùng

### Graph Preview trong Inspector

- Hiển thị phiên bản graph thu gọn.
- Cho phép hover để làm nổi các node liên quan.
- Cho phép click để chọn node.
- Không cho drag node trong vùng nhỏ, tránh thao tác nhầm.
- Nút **Mở graph** mở Graph Explorer trên canvas lớn.

### Graph Explorer

- Force-directed layout bằng `d3-force`.
- Category được ghim tại tâm canvas.
- Kích thước node dựa trên degree nhưng có giới hạn tối thiểu và tối đa.
- Màu sắc phân biệt category, tài liệu hiện tại, note/topic và tag.
- Hover một node sẽ làm nổi neighborhood và làm mờ phần không liên quan.
- Click node sẽ mở detail panel.
- Note tồn tại trong vault có nút **Mở trong Obsidian**.
- Hỗ trợ kéo node, pan nền, wheel zoom, nút zoom, vừa khung và đặt lại.
- Chuyển được giữa depth 1 và depth 2.
- Cho phép bật hoặc tắt tag nodes.
- Lưu tùy chọn depth và tag visibility trong `localStorage`.
- Dialog đóng bằng phím `Escape` và trả focus về nút **Mở graph**.
- Trên mobile, dialog chiếm toàn màn hình.
- Tôn trọng thiết lập `prefers-reduced-motion`.

## 5. Kiến trúc tổng thể

```text
Markdown + Metadata đang chỉnh sửa
              │
              ▼
POST /api/jobs/{job_id}/graph-preview
              │
              ▼
       VaultGraphService
       ├─ Kiểm tra graph roots
       ├─ Index file Markdown
       ├─ Parse YAML frontmatter
       ├─ Parse tags
       ├─ Parse wikilinks
       ├─ Cache theo mtime_ns + size
       ├─ Dựng neighborhood depth 1/2
       └─ Giới hạn và ưu tiên nodes
              │
              ▼
      Nodes + Edges JSON
              │
              ▼
React Graph Preview → lazy-loaded d3-force canvas
```

### Công nghệ chính

- **Backend:** Python, FastAPI, Pydantic và PyYAML.
- **Frontend:** React, Vite, SVG và `d3-force`.
- **Kiểm thử:** Python `unittest`, Vitest và Testing Library.
- **Chất lượng code:** Oxlint và Design.md lint.
- **Tích hợp Obsidian:** Wikilinks và `obsidian://` URI.

## 6. API Graph Preview

### Endpoint

```http
POST /api/jobs/{job_id}/graph-preview
```

Endpoint chỉ hoạt động khi job ở trạng thái `ready` hoặc `exported`:

- Trả `404` nếu job không tồn tại.
- Trả `409` nếu tài liệu chưa sẵn sàng.

### Request mẫu

```json
{
  "markdown": "Markdown đã chỉnh sửa",
  "metadata": {
    "title": "Ghi chú vật lý",
    "summary": "Tóm tắt tài liệu",
    "document_type": "notes",
    "category": "Học tập",
    "tags": ["vật-lý", "ôn-tập", "ghi-chú"],
    "topics": ["Vật lý", "Năng lượng"]
  },
  "depth": 1,
  "include_tags": true
}
```

### Response mẫu

```json
{
  "center_id": "category:hoc-tap",
  "nodes": [
    {
      "id": "note:OmniScribe/Inbox/example.md",
      "label": "Example",
      "type": "note",
      "degree": 3,
      "exists": true,
      "current": false,
      "path": "OmniScribe/Inbox/example.md",
      "open_uri": "obsidian://open?..."
    }
  ],
  "edges": [
    {
      "source": "category:hoc-tap",
      "target": "note:OmniScribe/Inbox/example.md",
      "type": "category"
    }
  ],
  "truncated": false,
  "vault_available": true,
  "warnings": []
}
```

Frontend debounce request trong 400 ms, dùng `AbortController` để hủy request cũ và không cho stale response ghi đè graph mới.

## 7. Index vault và cache

- Cấu hình thư mục cần index bằng `VAULT_GRAPH_ROOTS`.
- Giá trị mặc định là `OmniScribe`.
- Có thể khai báo nhiều thư mục tương đối, phân cách bằng dấu phẩy.
- Chỉ dùng `.` khi người dùng chủ động muốn index toàn bộ vault.
- Chỉ index file Markdown.
- Không đọc `.obsidian`, attachments hoặc file không phải Markdown.
- Không theo symlink ra ngoài vault.
- Cache mỗi note theo relative path, `mtime_ns` và kích thước file.
- Mỗi request chỉ parse file mới hoặc đã thay đổi.
- Entry cache của file đã bị xóa cũng được loại bỏ.
- Giới hạn mặc định là `VAULT_GRAPH_MAX_NODES=80`.
- Thứ tự ưu tiên gồm category, tài liệu hiện tại, liên kết trực tiếp, rồi mới đến liên kết depth 2.

## 8. An toàn và quyền riêng tư

Đây là một điểm quan trọng của thiết kế:

- Graph roots bắt buộc nằm bên trong vault.
- Symlink không được dùng để thoát ra ngoài vault.
- API không trả nội dung của các note.
- API không trả đường dẫn tuyệt đối của vault.
- API không trả metadata không cần thiết cho graph.
- Node path luôn là đường dẫn tương đối.
- Nếu vault không đọc được, phần kiểm bản Markdown và metadata vẫn hoạt động.
- Frontend hiển thị graph metadata fallback cùng một cảnh báo cụ thể.
- Backend index không tự động sửa bất kỳ note cũ nào.

## 9. Export sang Obsidian

Sau khi export, cấu trúc dữ liệu chính có dạng:

```text
OmniScribe/
├─ Inbox/
├─ Topics/
├─ Categories/
└─ Attachments/
```

Exporter thực hiện:

- Giữ `category` trong YAML frontmatter dưới dạng text để tương thích.
- Tạo topic notes nếu chưa tồn tại.
- Tạo category note nếu chưa tồn tại.
- Không ghi đè topic/category note đã có.
- Thêm section `Danh mục` vào note chính.

Ví dụ:

```markdown
## Danh mục

[[OmniScribe/Categories/Học tập|Học tập]]
```

## 10. Migration note cũ

Backend không tự động thay đổi note cũ. Người dùng phải chủ động chạy migration:

```powershell
python backend/scripts/migrate_category_links.py --dry-run
python backend/scripts/migrate_category_links.py --apply
```

Quy tắc migration:

- Chỉ xử lý note dưới `OmniScribe/Inbox`.
- Chỉ xử lý note có `source: handwritten`.
- Dry-run chỉ liệt kê, không ghi file.
- Apply tạo category notes và thêm section `Danh mục` nếu thiếu.
- Mỗi file sắp sửa được sao lưu vào `OmniScribe/.omniscribe-backups/<timestamp>/`.
- Script có tính idempotent: chạy lại không nhân đôi section hoặc wikilink.

## 11. Trạng thái kiểm thử và xác minh

| Hạng mục | Kết quả |
|---|---:|
| Backend tests | 15/15 đạt |
| Frontend logic tests cũ | 5/5 đạt |
| Vitest/Testing Library mới | 8/8 đạt |
| Oxlint | Đạt |
| Design lint | 0 lỗi, 0 cảnh báo |
| Production build | Đạt |
| Graph lazy-loaded chunk | Khoảng 21,9 kB |
| Migration dry-run | Thành công, không ghi file |
| `git diff --check` | Đạt |

Production build vẫn có cảnh báo kích thước initial bundle đã tồn tại và được chấp nhận trong phạm vi phiên bản này. Graph engine cùng `d3-force` đã được tách vào chunk lazy riêng, không làm tăng initial chunk của ứng dụng.

## 12. Giá trị của cải tiến

- Graph Preview chuyển từ hình minh họa metadata thành công cụ khám phá knowledge base cục bộ.
- Người dùng thấy ngay tài liệu đang kiểm bản liên quan đến những note nào.
- Category tạo một cấu trúc điều hướng nhất quán giữa metadata, graph và vault.
- Fallback giúp lỗi đọc vault không làm gián đoạn quy trình kiểm bản.
- Phạm vi index rõ ràng giúp giảm rủi ro riêng tư và tránh đọc toàn vault ngoài ý muốn.
- Lazy loading giữ chi phí graph engine ra khỏi luồng tải ban đầu.
- Migration có kiểm soát giúp nâng cấp note cũ mà không tạo thay đổi ngầm.

## 13. Giới hạn hiện tại

Phiên bản này chưa triển khai:

- Global graph.
- Cú pháp tìm kiếm như Obsidian.
- Custom groups.
- Force sliders.
- Context menu.
- Time-lapse graph.
- Lưu vị trí node lâu dài giữa các phiên.

Vị trí force layout chỉ tồn tại trong phiên làm việc. Chỉ tùy chọn depth và tag visibility được lưu cục bộ.

## 14. Hướng phát triển có thể đề xuất

- Bổ sung bộ lọc theo loại note hoặc thư mục.
- Cải thiện giải quyết wikilink trùng tên bằng ngữ cảnh thư mục.
- Cung cấp thống kê graph như node trung tâm hoặc note cô lập.
- Cho phép người dùng chọn graph roots từ giao diện cấu hình.
- Tối ưu index cho vault rất lớn.
- Bổ sung đo hiệu năng và khả năng truy cập trên thiết bị thật.

## 15. Hình ảnh nên cung cấp cho ChatGPT Web

Nếu muốn DOCX trực quan, hãy đính kèm và ghi rõ tên cho các hình sau:

1. Toàn cảnh OmniScribe workstation.
2. Graph Preview nhỏ trong Inspector.
3. Graph Explorer trên desktop.
4. Trạng thái hover làm nổi neighborhood.
5. Detail panel của một note có nút **Mở trong Obsidian**.
6. Graph Explorer trên mobile.
7. Cấu trúc thư mục vault sau export.
8. Hình so sánh Graph Preview cũ và Hybrid Local Graph mới.

Không nên gửi cho ChatGPT Web:

- API keys.
- File `.env` thật.
- Absolute vault path có thông tin cá nhân.
- Nội dung note riêng tư không cần thiết.

---

# Prompt dùng cho ChatGPT Web

```text
Hãy đọc toàn bộ tài liệu brief tôi cung cấp và tạo một file DOCX dùng để thuyết trình về tính năng “Hybrid Local Graph cho OmniScribe AI”.

Yêu cầu chung:
- Ngôn ngữ: tiếng Việt.
- Đối tượng nghe: giảng viên, hội đồng đánh giá và người có kiến thức công nghệ ở mức cơ bản đến trung bình.
- Thời lượng trình bày dự kiến: 10–15 phút.
- Phong cách: chuyên nghiệp, kỹ thuật nhưng dễ hiểu, có tính học thuật vừa phải.
- Không dùng giọng quảng cáo và không phóng đại kết quả.
- Không bịa thêm tính năng, số liệu hoặc kết quả chưa có trong brief.
- Phân biệt rõ tính năng đã triển khai, giới hạn hiện tại và hướng phát triển đề xuất.

Hãy tạo DOCX với cấu trúc sau:
1. Trang bìa: tên sản phẩm, tên tính năng và một câu mô tả ngắn.
2. Tóm tắt điều hành.
3. Bối cảnh của OmniScribe AI.
4. Hạn chế của Graph Preview metadata-only trước đây.
5. Mục tiêu và nguyên tắc thiết kế của Hybrid Local Graph.
6. Trải nghiệm người dùng: preview nhỏ và Graph Explorer.
7. Kiến trúc frontend–API–VaultGraphService bằng sơ đồ dễ đọc.
8. Cách index Markdown, YAML frontmatter, tags và wikilinks.
9. Depth 1/2, node priority, force layout và degree sizing.
10. An toàn dữ liệu, root confinement và fallback khi vault không khả dụng.
11. Export category notes và quy trình migration note cũ.
12. Bảng kết quả kiểm thử và xác minh.
13. Giá trị mang lại cho người dùng và hệ thống.
14. Giới hạn hiện tại.
15. Hướng phát triển.
16. Kết luận.

Yêu cầu trình bày trong DOCX:
- Có mục lục tự động.
- Dùng heading styles đúng cấp để có thể cập nhật mục lục.
- Mỗi phần có 3–5 ý chính ngắn gọn trước, sau đó mới giải thích chi tiết.
- Thêm “Ghi chú thuyết trình” ở cuối mỗi phần để người nói biết nên trình bày gì.
- Với mỗi phần phù hợp, ghi placeholder dạng “[Chèn Hình X tại đây]” và viết caption đề xuất.
- Chuyển kiến trúc hệ thống thành sơ đồ hoặc SmartArt nếu công cụ hỗ trợ; nếu không, dùng sơ đồ khối đơn giản.
- Trình bày API request/response, lệnh migration và cấu trúc thư mục bằng font monospace.
- Kết quả kiểm thử phải trình bày bằng bảng, giữ nguyên số liệu trong brief.
- Có một bảng so sánh “Graph cũ” và “Hybrid Local Graph”.
- Có một trang cuối gồm 5–7 câu hỏi phản biện có thể được hội đồng đặt ra, kèm câu trả lời gợi ý ngắn.
- Độ dài mục tiêu: khoảng 12–18 trang, chưa tính mục lục.
- Ưu tiên nội dung dễ dùng làm kịch bản thuyết trình, không biến tài liệu thành đặc tả code quá chi tiết.

Đầu ra:
- Tạo và cung cấp file DOCX hoàn chỉnh.
- Sau khi tạo file, tóm tắt cấu trúc tài liệu và liệt kê những hình ảnh còn cần tôi bổ sung.

Tài liệu nguồn là file Markdown “hybrid-local-graph-presentation-brief.md” được đính kèm. Hãy dùng file đó làm nguồn sự thật duy nhất cho nội dung kỹ thuật và số liệu.
```
