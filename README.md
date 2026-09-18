# ☁️ CLOUD FILE MANAGER

Personal Cloud Storage System (Google Drive Clone) built with **React, TypeScript, Ant Design, Node.js, Express.js, MySQL, Sequelize ORM, Amazon S3, and AWS**.

---

## 📌 Project Overview

Cloud File Manager is a personal file management web application allowing users to manage files and hierarchical directories securely. File metadata and folder structures are managed in MySQL via Sequelize ORM, while binary files are securely uploaded, stored, and retrieved via Amazon S3 presigned URLs.

The frontend is built with **React 18 + TypeScript + Vite + Ant Design 5**, providing a clean, responsive single-page application (SPA) with Vietnamese localization.

---

## 🚀 Key Features

* 🔐 **Authentication & Authorization**: Invitation-only registration, login, and opaque server-side sessions stored in HttpOnly cookies, with bcrypt password hashing and CSRF protection (`X-CSRF-Token`).
* 📁 **Folder Management**: Root and nested folder navigation, breadcrumbs, folder creation, renaming, and empty-folder deletion.
* 📄 **File Operations**: Direct S3 upload sessions with client-side validation (PDF, JPEG, PNG, TXT up to 50 MiB), download via presigned URLs, file renaming, moving between folders, and moving to trash.
* 🗑️ **Trash & Retention**: View trashed files with status filters, restore files to active drive, and request permanent file purge.
* 📊 **Storage & Quota Tracking**: Real-time storage usage and reserved quota indicator.
* 📜 **Activity History**: Audit log tracking all user operations (uploads, renames, moves, deletions).
* 🛡️ **Strict Multi-tenant Security**: Users can strictly only view, modify, and access their own files and folders. `user_id` is resolved from the server-side session (`req.user.id`).
* 📖 **Swagger API Docs**: Built-in interactive OpenAPI / Swagger documentation (`/api-docs`).

---

## 🛠️ Technology Stack

### Frontend
* **Core**: React 18, TypeScript, Vite
* **UI Components**: Ant Design (`antd`), `@ant-design/icons`
* **Routing**: React Router (`react-router-dom` v6)
* **API Integration**: Centralized `fetch` client with CSRF token management and HttpOnly session cookies

### Backend
* **Runtime & Framework**: Node.js (>=20) & Express.js (ES Modules)
* **Database & ORM**: MySQL (XAMPP / local dev) with Sequelize ORM
* **Cloud Storage**: Amazon S3 via `@aws-sdk/client-s3` (v3)
* **Security & Auth**: Server-side opaque sessions, `bcryptjs`, `cors`, `helmet` (CSP)
* **API Documentation**: Swagger UI Express (`swagger-ui-express`, `swagger-jsdoc`)

---

## 📁 Project Structure

```text
cloud-file-manager/
│
├── frontend/                          # React + TypeScript + Vite Frontend
│   ├── src/
│   │   ├── app/                       # App root, routes, providers
│   │   │   ├── App.tsx
│   │   │   └── routes.tsx
│   │   ├── layouts/                   # Main responsive layout (Header, Sider, Quota)
│   │   │   └── MainLayout.tsx
│   │   ├── components/                # Shared UI components (FileIcon, etc.)
│   │   │   └── FileIcon.tsx
│   │   ├── features/                  # Feature-based domain modules
│   │   │   ├── auth/                  # Login, Register, AuthContext, ProfileModal
│   │   │   ├── drive/                 # DrivePage, Folder modals, File table
│   │   │   ├── uploads/               # S3 Direct UploadContext, UploadListDrawer
│   │   │   ├── trash/                 # TrashPage, restore & purge actions
│   │   │   └── activity/              # ActivityPage audit log
│   │   ├── lib/                       # Centralized API client, formatters, types
│   │   │   ├── api.ts
│   │   │   ├── formatters.ts
│   │   │   └── types.ts
│   │   ├── theme/                     # Ant Design theme tokens
│   │   │   └── theme.ts
│   │   ├── main.tsx                   # Frontend entry point
│   │   └── index.css                  # Minimal reset styles
│   ├── package.json
│   ├── tsconfig.json
│   └── vite.config.ts                 # Vite proxy configured for /api
│
├── backend/                           # Node.js + Express Backend
│   ├── database/                      # SQL schema migrations
│   ├── src/
│   │   ├── config/                    # DB & AWS configuration
│   │   ├── controllers/               # Express route controllers
│   │   ├── middleware/                # Auth, CSRF, error, validation middleware
│   │   ├── models/                    # Sequelize models (User, Folder, File, etc.)
│   │   ├── routes/                    # API routes (/api/*)
│   │   ├── services/                  # Business logic & S3 integrations
│   │   ├── app.js                     # Express app & static SPA serving
│   │   ├── server.js                  # HTTP server bootstrap
│   │   └── worker.js                  # Background queue worker
│   ├── test/                          # Automated backend test suite
│   └── package.json
│
├── package.json                       # npm workspaces and shared commands
├── .env                               # Environment variables (gitignored)
├── .env.example                       # Environment template
└── README.md
```

---

## ⚙️ Environment Setup & Installation

### 1. Configure Environment Variables
Copy `.env.example` to `.env` in the root directory:
```bash
cp .env.example .env
```
Key configuration settings in `.env`:
* `PORT`: Backend port (default `3000`).
* `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD`: MySQL database credentials.
* `AWS_REGION`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_S3_BUCKET`: Amazon S3 bucket credentials.
* `APP_ORIGIN`: (Optional) Expected origin for CSRF check (defaults to `${protocol}://${host}`).

### 2. Install Dependencies

Run all commands from the project root. npm workspaces manages `backend/` and `frontend/` with one root `package-lock.json`.

```bash
npm install
npm run db:migrate
npm run dev
```

Open `http://localhost:5173`. Both dev servers run in one terminal; Ctrl+C stops both. Start MySQL first. Backend commands load the root `.env` automatically. AWS configuration is required for actual S3 uploads.

Keep all three `package.json` files and commit only the root `package-lock.json`. Do not maintain lockfiles inside the workspaces. For reproducible installation on a fresh checkout or CI, run `npm ci` from the root.

To add a dependency to one application:

```bash
npm install <package> --workspace frontend
npm install <package> --workspace backend
```

## Common Commands

| Command (from root) | Purpose |
| --- | --- |
| `npm run dev` | Start frontend and backend together |
| `npm run build` | Type-check and build the frontend |
| `npm start` | Serve the API and built frontend on port 3000 |
| `npm test` | Run backend and frontend tests |
| `npm run worker` | Start the background worker separately |
| `npm run db:migrate` | Apply pending database migrations |
| `npm run db:status` | Show migration status |

For production, run `npm run build` followed by `npm start`. Run the worker separately when using background file processing.

To run one app only: `npm run dev --workspace frontend` or `npm run dev --workspace backend`.

---

## 🔒 Security Practices

* **Opaque Server-Side Sessions**: Sessions are tracked in the database and referenced via HttpOnly, SameSite cookies. No credentials or JWT tokens are stored in `localStorage`.
* **CSRF Protection**: Non-safe HTTP methods (POST, PUT, DELETE) require a valid `X-CSRF-Token` header and origin verification.
* **Direct S3 Uploads**: Files are uploaded directly to Amazon S3 via presigned POST policies to prevent backend server bottlenecks and memory exhaustion.
* **Strict Multi-tenancy**: Resource access is verified against the authenticated user ID (`req.user.id`).
* **Content Security Policy**: Configured via Helmet to permit direct connections to AWS S3 endpoints.
