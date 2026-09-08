# ☁️ CLOUD FILE MANAGER

Personal Cloud Storage System (Google Drive Clone) built with **Node.js, Express.js, MySQL, Sequelize ORM, Amazon S3, and AWS**.

---

## 📌 Project Overview

Cloud File Manager is a personal file management web application allowing users to manage files and hierarchical directories securely. File metadata and folder structure are managed in MySQL via Sequelize ORM, while binary files are securely uploaded, stored, and retrieved via Amazon S3 presigned URLs.

---

## 🚀 Key Features

* 🔐 **Authentication & Authorization**: User registration, login with JWT tokens, password hashing with `bcrypt`, user profile management, password updates.
* 📁 **Folder Management**: Create root & nested folders, rename folders, delete folders, list hierarchical contents.
* 📄 **File Operations**: Multi-part file upload to AWS S3, metadata storage in MySQL, rename files, move files across folders, download files via S3 Presigned URLs, safe file deletion.
* 🛡️ **Strict Multi-tenant Security**: Users can strictly only view, modify, and access their own files and folders. `user_id` is parsed directly from validated JWT payload (`req.user.id`).
* 📖 **Swagger API Docs**: Built-in interactive OpenAPI / Swagger documentation (`/api-docs`).

---

## 🛠️ Technology Stack

* **Backend Framework**: Node.js & Express.js
* **Database & ORM**: MySQL (XAMPP local dev) with Sequelize ORM
* **Cloud Storage**: Amazon S3 via `@aws-sdk/client-s3` (v3)
* **Security & Auth**: JWT (`jsonwebtoken`), `bcryptjs`, `cors`, `helmet`
* **File Upload**: `multer`
* **API Documentation**: Swagger UI Express (`swagger-ui-express`, `swagger-jsdoc`)

---

## 📁 Project Structure

```text
cloud-file-manager/
│
├── database/
│   └── cloud_file_manager.sql       # MySQL DDL initialization script
│
├── src/
│   ├── config/
│   │   ├── database.js              # Sequelize DB connection config
│   │   └── aws.js                   # AWS S3 Client setup
│   │
│   ├── controllers/
│   │   ├── auth.controller.js       # Register, Login, Current User, Change Password
│   │   ├── user.controller.js       # Profile management
│   │   ├── folder.controller.js     # Folder CRUD logic
│   │   └── file.controller.js       # File Upload, Download Presigned URL, Move, Delete
│   │
│   ├── middleware/
│   │   ├── auth.middleware.js       # JWT validation middleware
│   │   ├── error.middleware.js      # Global & 404 error handler
│   │   └── upload.middleware.js     # Multer memory configuration
│   │
│   ├── models/
│   │   ├── User.js                  # User Sequelize model
│   │   ├── Folder.js                # Folder Sequelize model
│   │   ├── File.js                  # File Sequelize model
│   │   └── index.js                 # Sequelize model associations
│   │
│   ├── routes/
│   │   ├── auth.routes.js           # /api/auth routes
│   │   ├── user.routes.js           # /api/users routes
│   │   ├── folder.routes.js         # /api/folders routes
│   │   └── file.routes.js           # /api/files routes
│   │
│   ├── services/
│   │   ├── auth.service.js          # Authentication business logic
│   │   ├── user.service.js          # User business logic
│   │   ├── folder.service.js        # Folder hierarchy logic
│   │   ├── file.service.js          # File metadata logic
│   │   └── s3.service.js            # AWS S3 PutObject, GetObject Presigned URL, DeleteObject
│   │
│   ├── utils/
│   │   ├── jwt.js                   # JWT sign / verify helpers
│   │   └── response.js              # Standard API response utility
│   │
│   ├── app.js                       # Express app configuration & middleware
│   └── server.js                    # Application entry point & server listener
│
├── .env                             # Environment variables (gitignored)
├── .env.example                     # Environment template
├── .gitignore
├── package.json
└── README.md
```

---

## 🗄️ Database Design

The system uses strictly 3 relational tables in MySQL:

1. **`users`**: User accounts (`id`, `username`, `email`, `password_hash`, `full_name`, `avatar_url`, `role`, `is_active`, `created_at`, `updated_at`).
2. **`folders`**: Hierarchical folder structures (`id`, `user_id`, `parent_id` [NULL for root], `name`, `created_at`, `updated_at`).
3. **`files`**: File metadata (`id`, `user_id`, `folder_id` [NULL for root], `file_name`, `original_name`, `s3_key`, `mime_type`, `file_size`, `extension`, `status`, `created_at`, `updated_at`).

---

## ⚙️ Environment Setup & Installation

1. **Clone or navigate to project directory**:
   ```bash
   cd d:/TTTN_DATN/TTTN/Project
   ```

2. **Install Dependencies**:
   ```bash
   npm install
   ```

3. **Configure Environment Variables**:
   Copy `.env.example` to `.env`:
   ```bash
   cp .env.example .env
   ```
   Fill in your local MySQL credentials and AWS S3 configuration details.

---

## 🏃 Running the Application

### Development Mode (with nodemon):
```bash
npm run dev
```

### Production Mode:
```bash
npm start
```

### Health Check Verification:
```http
GET /api/health
```

Expected Response:
```json
{
  "success": true,
  "message": "Cloud File Manager API is running"
}
```

---

## 🔒 Security Practices

* Strict user-level authorization check on every route (`req.user.id`).
* `user_id` is never accepted from body or route query parameters to determine resource ownership.
* Secure S3 storage keys format: `users/{user_id}/files/{file_id}-{filename}`.
* Environment variables stored safely in `.env`.
