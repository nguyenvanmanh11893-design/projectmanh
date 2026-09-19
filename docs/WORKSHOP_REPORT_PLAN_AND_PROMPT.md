# Kế hoạch và prompt viết báo cáo workshop

## 1. Mục tiêu của báo cáo

Báo cáo nên trình bày Cloud File Manager như một sản phẩm đã được phát triển theo từng phase, tập trung vào bài toán, kiến trúc, các tính năng thực sự đã triển khai, quyết định kỹ thuật, kiểm thử và giới hạn hiện tại. Không cần ép nội dung theo một mẫu cố định nếu mẫu đó không phản ánh đúng project.

Nguyên tắc quan trọng nhất: phân biệt rõ ba trạng thái:

- **Đã triển khai trong mã nguồn**: có code, migration, test hoặc tài liệu kỹ thuật tương ứng.
- **Đã kiểm thử cục bộ**: có kết quả được ghi trong `docs/IMPLEMENTATION_STATUS.md`.
- **Chưa triển khai/chưa xác thực thực tế**: AWS production, Linux runtime, browser E2E, MySQL integration và Phase 10B chưa được chứng minh hoàn tất.

## 2. Nguồn thông tin nên cung cấp cho model

Ưu tiên đọc theo thứ tự sau:

1. `docs/IMPLEMENTATION_STATUS.md` — nguồn chính về những gì đã làm, kết quả kiểm thử và giới hạn.
2. `README.md` — tổng quan sản phẩm, tính năng và cách chạy local.
3. `docs/IMPLEMENTATION_PLAN.md` — mục tiêu, phase và acceptance checklist.
4. `docs/S3_DIRECT_UPLOAD.md`, `docs/DURABLE_WORKER.md`, `docs/FILE_LIFECYCLE.md` — luồng upload, xử lý nền, trash/purge và reconciliation.
5. `docs/OBSERVABILITY_CICD.md`, `docs/RUNBOOKS.md` — logging, monitoring, CI/CD và vận hành.
6. `deployment/phase9/README.md` và `infra/terraform/` — kiến trúc triển khai AWS; phải ghi rõ cấu hình này chưa được deploy.
7. `backend/src/`, `frontend/src/`, `lambdas/`, `backend/test/` và `frontend/test/` — dùng để kiểm chứng khi tài liệu mâu thuẫn hoặc thiếu thông tin.

Không dùng `docs/SPEC.md` làm nguồn duy nhất cho frontend vì chính tài liệu triển khai cho biết phần mô tả static frontend trong đó đã cũ.

## 3. Kế hoạch thực hiện báo cáo

### Bước 1 — Xác định yêu cầu đầu ra

Ghi lại tên workshop, đối tượng nghe, thời lượng trình bày, độ dài mong muốn, ngôn ngữ, mẫu bắt buộc của giảng viên/đơn vị và yêu cầu về hình ảnh/minh chứng. Nếu chưa có thông tin, dùng mặc định: báo cáo tiếng Việt, 12–18 trang nội dung, trình bày 15–20 phút.

### Bước 2 — Lập ma trận bằng chứng

Tạo bảng làm việc trước khi viết:

| Nội dung | Trạng thái | Bằng chứng | Có thể tuyên bố |
| --- | --- | --- | --- |
| Tính năng người dùng | Đã code/đã test/chưa test thật | File, test, tài liệu | Câu mô tả thận trọng |
| Bảo mật | Đã code/đã review/chưa chạy production | Middleware, service, test | Phạm vi bảo vệ |
| AWS/IaC | Đã cấu hình/chưa deploy | Terraform, runbook | Thiết kế, không phải hệ thống đang chạy |
| CI/CD, monitoring | Đã cấu hình/chưa chạy môi trường thật | Workflow, Terraform, docs | Năng lực đã chuẩn bị |

Nếu không tìm thấy bằng chứng, đánh dấu **chưa xác minh** thay vì suy đoán.

### Bước 3 — Chọn câu chuyện chính

Câu chuyện đề xuất: từ một ứng dụng quản lý file cơ bản đến một hệ thống lưu trữ cloud có bảo mật nhiều người dùng, direct upload S3, xử lý nền bền vững, vòng đời file, IaC, observability và delivery pipeline.

Chỉ chọn 3–5 điểm nổi bật để trình bày sâu:

- Opaque session + CSRF + invitation-only registration.
- Direct-to-S3 upload có quota reservation và xác thực nội dung bằng Lambda.
- Durable worker, idempotency, lease/fencing và phục hồi khi lỗi.
- Trash, delayed purge, S3 version-aware deletion và reconciliation.
- Terraform, logging/correlation, health checks, monitoring và CI/CD có kiểm soát.

### Bước 4 — Điều chỉnh khung mẫu

Giữ các mục bắt buộc trong mẫu. Với mục không phù hợp, đổi thành mục gần nhất hoặc ghi ngắn gọn “không thuộc phạm vi project”. Có thể gộp các mục trùng nhau và thêm các mục cần thiết như bảo mật, xử lý lỗi, giới hạn và hướng phát triển. Không tạo nội dung giả chỉ để lấp đầy mẫu.

### Bước 5 — Viết bản nháp có kiểm soát tuyên bố

Mỗi tính năng quan trọng nên trả lời được:

1. Bài toán là gì?
2. Giải pháp được thiết kế ra sao?
3. Thành phần nào thực hiện?
4. Đã kiểm chứng bằng cách nào?
5. Còn giới hạn/rủi ro gì?

Không đưa secret, nội dung `.env`, credential, dữ liệu cá nhân hoặc URL nội bộ vào báo cáo.

### Bước 6 — Chuẩn bị minh họa và demo

Ưu tiên các hình sau nếu có thể tự chụp/vẽ:

- Sơ đồ kiến trúc tổng thể: React → Express API → MySQL/S3; S3 event → Lambda report → worker.
- Sequence diagram cho direct upload và finalize.
- State diagram vòng đời file/upload.
- Ảnh giao diện đăng nhập, Drive, upload, Trash, Activity.
- Bảng kiểm thử và trạng thái triển khai.

Demo nên có đường lui: video/ảnh dự phòng, dữ liệu mẫu, và không phụ thuộc vào AWS thật nếu môi trường chưa deploy.

### Bước 7 — Rà soát cuối

- Mọi tuyên bố “đã chạy production”, “đã deploy”, “an toàn tuyệt đối” phải bị loại nếu không có bằng chứng.
- Số lượng test và trạng thái pass/skip phải lấy từ tài liệu mới nhất hoặc chạy lại, không ghi theo trí nhớ.
- Thuật ngữ, tên route, công nghệ và sơ đồ phải thống nhất.
- Kết luận phải nêu cả kết quả đạt được và phần chưa hoàn tất.

## 4. Khung báo cáo Markdown linh hoạt

```markdown
# BÁO CÁO WORKSHOP: CLOUD FILE MANAGER

## Thông tin chung
- Người thực hiện:
- Đơn vị/lớp:
- Thời gian:
- Phạm vi workshop:

## 1. Tóm tắt
Tóm tắt bài toán, giải pháp, điểm nổi bật và trạng thái hiện tại trong 150–250 từ.

## 2. Bối cảnh và bài toán
- Nhu cầu quản lý file cá nhân trên cloud
- Các vấn đề cần giải quyết
- Đối tượng sử dụng và phạm vi

## 3. Mục tiêu và yêu cầu
### 3.1 Mục tiêu chức năng
### 3.2 Yêu cầu phi chức năng
### 3.3 Nội dung ngoài phạm vi

## 4. Công nghệ sử dụng
Trình bày vai trò của từng công nghệ, không chỉ liệt kê tên.

## 5. Kiến trúc hệ thống
### 5.1 Kiến trúc tổng thể
### 5.2 Mô hình dữ liệu chính
### 5.3 Luồng request và phân quyền
### 5.4 Luồng upload/xử lý file

## 6. Các tính năng đã thực hiện
Mỗi tính năng gồm: mục đích, cách hoạt động, thành phần triển khai, minh chứng và giới hạn.

## 7. Các điểm kỹ thuật nổi bật
- Bảo mật phiên và CSRF
- Quota và upload trực tiếp S3
- Lambda validation và durable worker
- Idempotency, retry, fencing và reconciliation
- Observability và CI/CD

## 8. Kiểm thử và kết quả
Phân biệt unit/static/integration/E2E/live acceptance; nêu rõ phần đã pass, skip và chưa chạy.

## 9. Khó khăn, quyết định và bài học
Nêu trade-off thực tế, lỗi/rủi ro đã xử lý và điều học được.

## 10. Trạng thái triển khai và giới hạn
Ghi rõ hệ thống đã implement nhưng chưa deploy production nếu trạng thái vẫn như hiện tại.

## 11. Hướng phát triển
Ưu tiên Phase 10B, acceptance trên môi trường thật, dependency review, E2E và các cải tiến phù hợp.

## 12. Kết luận

## Tài liệu tham khảo

## Phụ lục
- API/route tiêu biểu
- Danh sách test
- Kịch bản demo
- Liên kết mã nguồn/tài liệu
```

Có thể bỏ hoặc gộp mục nếu mẫu workshop không yêu cầu. Không cần giữ nguyên số thứ tự ở trên.

## 5. Prompt hoàn chỉnh cho model khác

Sao chép prompt dưới đây, thay các phần trong `[ngoặc vuông]`, rồi đính kèm mẫu báo cáo và các file nguồn cần thiết.

```text
Bạn là chuyên gia viết báo cáo kỹ thuật và kiến trúc phần mềm. Hãy giúp tôi soạn một báo cáo workshop bằng Markdown về project “Cloud File Manager”.

THÔNG TIN ĐẦU VÀO
- Đối tượng đọc/nghe: [giảng viên, sinh viên, kỹ sư...]
- Thời lượng trình bày: [ví dụ 15–20 phút]
- Độ dài mong muốn: [ví dụ 12–18 trang hoặc 4.000–6.000 từ]
- Ngôn ngữ: tiếng Việt
- Giọng văn: học thuật, rõ ràng, trung thực, dễ thuyết trình
- Khung mẫu bắt buộc: [dán nội dung mẫu hoặc ghi tên file đã đính kèm]
- Thông tin cá nhân cần điền: [tên, lớp, đơn vị...]

NHIỆM VỤ
1. Đọc toàn bộ tài liệu tôi cung cấp, trước hết là `docs/IMPLEMENTATION_STATUS.md`, sau đó mới dùng `README.md`, implementation plan, tài liệu kỹ thuật và mã nguồn để đối chiếu.
2. Trích xuất các tính năng thực sự đã được triển khai, quyết định kiến trúc, công nghệ, bằng chứng kiểm thử, giới hạn và việc chưa hoàn thành.
3. Tạo một bảng “ma trận bằng chứng” ngắn trước khi viết, gồm: nội dung, trạng thái, nguồn file và cách diễn đạt được phép dùng.
4. Điều chỉnh khung mẫu theo những gì project thực sự có. Giữ các mục bắt buộc nhưng được phép đổi tên, gộp, rút gọn hoặc thêm mục. Không cố viết nội dung không tồn tại chỉ để giống mẫu.
5. Viết báo cáo hoàn chỉnh bằng Markdown. Tập trung vào lý do thiết kế và luồng hoạt động, không biến báo cáo thành danh sách file hoặc sao chép README.
6. Với mỗi tính năng quan trọng, trình bày: bài toán, giải pháp, luồng xử lý, thành phần triển khai, bằng chứng và giới hạn.
7. Đề xuất vị trí chèn hình bằng cú pháp `> [Hình đề xuất: ...]`; đề xuất sơ đồ Mermaid khi có ích, nhưng không bịa ảnh chụp màn hình.
8. Cuối báo cáo, thêm kịch bản thuyết trình theo thời lượng đã cho và một checklist chuẩn bị demo.

QUY TẮC ĐỘ CHÍNH XÁC
- Phân biệt rõ: (a) đã có trong mã nguồn, (b) đã kiểm thử cục bộ, (c) đã cấu hình nhưng chưa chạy môi trường thật, và (d) chưa hoàn thành.
- Trạng thái hiện tại theo tài liệu là Phase 10A đã implement nhưng CHƯA DEPLOY; Phase 10B và live acceptance chưa hoàn tất. Không được mô tả Terraform, CI/CD, CloudWatch, AWS, Linux hoặc production như đã vận hành thực tế nếu nguồn không chứng minh điều đó.
- Không biến unit/static test thành bằng chứng cho MySQL concurrency, AWS IAM/network, S3 thật, browser E2E hoặc production readiness.
- Không tự tạo số liệu, kết quả test, endpoint, tính năng, chi phí hoặc benchmark. Nếu nguồn mâu thuẫn, ưu tiên tài liệu trạng thái mới nhất và ghi chú mâu thuẫn.
- Không dùng `docs/SPEC.md` làm nguồn duy nhất cho frontend vì mô tả frontend tĩnh trong đó đã cũ.
- Không tiết lộ `.env`, secret, credential hoặc dữ liệu nhạy cảm.
- Không dùng các câu tuyệt đối như “an toàn 100%”, “không thể lỗi”, “production-ready”.
- Khi thiếu thông tin không quan trọng, ghi `[CẦN BỔ SUNG: ...]`. Chỉ hỏi tôi nếu thiếu thông tin làm thay đổi đáng kể cấu trúc hoặc kết luận.

NHỮNG CHỦ ĐỀ NÊN CÂN NHẮC
- React/TypeScript/Vite/Ant Design frontend và Express/Sequelize/MySQL backend.
- Opaque server-side session, HttpOnly cookie, CSRF, invitation-only registration và ownership isolation.
- Direct S3 upload, presigned POST, quota reservation, exact S3 version và Lambda file validation.
- Durable worker, job lease/fencing, idempotency, retry và upload finalization.
- Trash/restore/delayed permanent purge, version-aware deletion và reconciliation.
- Terraform AWS architecture, logging/correlation, health/readiness, CloudWatch và manual-gated CI/CD — luôn kèm trạng thái chưa deploy/chưa live-acceptance.
- Kết quả kiểm thử mới nhất và các test còn skip/chưa chạy.

ĐẦU RA
A. “Giả định và dữ liệu còn thiếu” (ngắn).
B. “Ma trận bằng chứng” (bảng).
C. “Dàn ý đã điều chỉnh từ khung mẫu”.
D. Báo cáo Markdown hoàn chỉnh.
E. Kịch bản thuyết trình theo phút.
F. Checklist demo và danh sách câu hỏi phản biện có thể gặp kèm câu trả lời ngắn.

Trước khi trả lời, tự kiểm tra rằng mọi tuyên bố quan trọng đều truy ngược được về file nguồn tôi đã cung cấp.
```

## 6. Nhận xét nhanh về các README hiện tại

### `README.md` ở thư mục gốc

Mức độ: **đủ để giới thiệu và chạy local cơ bản, chưa đủ làm tài liệu nền duy nhất cho báo cáo**.

Điểm tốt:

- Nêu rõ bài toán, stack, tính năng người dùng, bảo mật và lệnh chạy phổ biến.
- Cách cài theo npm workspaces khá rõ.
- Không tuyên bố trực tiếp rằng project đã được deploy.

Điểm cần cập nhật:

- Thêm một mục **Project Status**: Phase 10A đã implement nhưng chưa deploy; Phase 10B/live acceptance chưa hoàn tất.
- Cập nhật cây thư mục: hiện không có `frontend/src/features/uploads/`; upload UI nằm tại `features/drive/UploadModal.tsx`. Bổ sung `docs/`, `infra/`, `lambdas/`, `deployment/`, `contracts/` và `.github/workflows/`.
- Bổ sung mô tả Lambda validator, durable worker, upload finalization, lifecycle/reconciliation, observability, CI/CD và Terraform.
- Thêm sơ đồ kiến trúc/luồng upload và liên kết tới các tài liệu chuyên sâu.
- Phân biệt yêu cầu dev Node >=20 với target CI/runtime Node 22 nếu đây vẫn là chủ đích của project.
- Không nên trình bày static AWS access key là lựa chọn mặc định; giải thích credential provider chain/role cho môi trường phù hợp.
- Thêm prerequisites và hướng dẫn tạo invitation/bootstrap dữ liệu cần thiết để người mới có thể đăng ký và demo.
- Thêm mục kiểm thử, giới hạn đã biết và cảnh báo rằng worker phải chạy riêng cho xử lý nền.

### `lambdas/s3-file-validator/README.md`

Mức độ: **tốt về contract và ranh giới bảo mật, còn thiếu hướng dẫn sử dụng thực hành**.

Nên bổ sung cấu hình runtime/handler, cách package/deploy hoặc liên kết tới runbook Phase 9, lệnh test liên quan, ví dụ event/report đã lược bỏ dữ liệu nhạy cảm, giới hạn timeout/memory và cách xử lý failure destination.

### `deployment/phase9/README.md`

Mức độ: **rất chi tiết và thận trọng, phù hợp runbook kỹ thuật hơn là README nhập môn**.

Nên thêm mục lục và một “quick orientation” ngắn ở đầu: kiến trúc, trạng thái chưa deploy, prerequisites, thứ tự các giai đoạn và các thao tác bị cấm nếu chưa được phê duyệt. Phần còn lại đã bao phủ tốt bảo mật, secret bootstrap, TLS, vận hành, chi phí, acceptance và teardown.

### Nhận xét chung

Kho tài liệu chuyên sâu đã mạnh, đặc biệt `IMPLEMENTATION_STATUS.md`, nhưng thông tin bị phân tán và README gốc chưa dẫn đường tới chúng. Đối với workshop, nên coi `IMPLEMENTATION_STATUS.md` là nguồn xác nhận trạng thái; README gốc chỉ là trang giới thiệu.
