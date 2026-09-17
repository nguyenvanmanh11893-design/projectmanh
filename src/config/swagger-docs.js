/**
 * @openapi
 * /api/health:
 *   get:
 *     summary: System Health Check
 *     tags:
 *       - System
 *     responses:
 *       200:
 *         description: API is running healthily
 * 
 * /api/auth/register:
 *   post:
 *     summary: Register a new user
 *     tags:
 *       - Auth
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [username, email, password, invitation_token]
 *             properties:
 *               username: { type: string, example: "manh" }
 *               email: { type: string, example: "manh@gmail.com" }
 *               password: { type: string, example: "ValidPassword1" }
 *               full_name: { type: string, example: "Nguyen Van Manh" }
 *               invitation_token: { type: string }
 *     responses:
 *       201:
 *         description: Registration successful
 * 
 * /api/auth/login:
 *   post:
 *     summary: Login user
 *     tags:
 *       - Auth
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [password]
 *             properties:
 *               username: { type: string, example: "manh" }
 *               email: { type: string, example: "manh@gmail.com" }
 *               password: { type: string, example: "ValidPassword1" }
 *     responses:
 *       200:
 *         description: Sets an HttpOnly session cookie and returns a CSRF token
 * 
 * /api/auth/me:
 *   get:
 *     summary: Get current authenticated user profile
 *     tags:
 *       - Auth
 *     security:
 *       - sessionCookie: []
 *     responses:
 *       200:
 *         description: User profile details
 * 
 * /api/users/me:
 *   put:
 *     summary: Update profile details
 *     tags:
 *       - User
 *     security:
 *       - sessionCookie: []
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               full_name: { type: string, example: "Nguyen Van Manh" }
 *               avatar_url: { type: string, example: "https://example.com/avatar.jpg" }
 *     responses:
 *       200:
 *         description: Profile updated
 * 
 * /api/users/me/password:
 *   put:
 *     summary: Change user password
 *     tags:
 *       - User
 *     security:
 *       - sessionCookie: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [current_password, new_password]
 *             properties:
 *               current_password: { type: string, example: "12345678" }
 *               new_password: { type: string, example: "newpassword" }
 *     responses:
 *       200:
 *         description: Password updated successfully
 * 
 * /api/folders:
 *   post:
 *     summary: Create folder
 *     tags:
 *       - Folders
 *     security:
 *       - sessionCookie: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name]
 *             properties:
 *               name: { type: string, example: "Documents" }
 *               parent_id: { type: string, nullable: true, example: null }
 *     responses:
 *       201:
 *         description: Folder created
 *   get:
 *     summary: Get root folders
 *     tags:
 *       - Folders
 *     security:
 *       - sessionCookie: []
 *     responses:
 *       200:
 *         description: List of root folders
 * 
 * /api/folders/{id}:
 *   get:
 *     summary: Get folder details with subfolders and files
 *     tags:
 *       - Folders
 *     security:
 *       - sessionCookie: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Folder details
 *   put:
 *     summary: Rename folder
 *     tags:
 *       - Folders
 *     security:
 *       - sessionCookie: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name]
 *             properties:
 *               name: { type: string, example: "Documents 2026" }
 *     responses:
 *       200:
 *         description: Folder renamed
 *   delete:
 *     summary: Delete folder
 *     tags:
 *       - Folders
 *     security:
 *       - sessionCookie: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Folder deleted
 * 
 * /api/files/upload:
 *   post:
 *     summary: Upload file to Amazon S3
 *     tags:
 *       - Files
 *     security:
 *       - sessionCookie: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               file:
 *                 type: string
 *                 format: binary
 *               folder_id:
 *                 type: string
 *                 nullable: true
 *     responses:
 *       201:
 *         description: File uploaded
 * 
 * /api/files:
 *   get:
 *     summary: List files (in root or folder)
 *     tags:
 *       - Files
 *     security:
 *       - sessionCookie: []
 *     parameters:
 *       - in: query
 *         name: folder_id
 *         schema: { type: string }
 *         description: Optional folder ID filter
 *       - in: query
 *         name: search
 *         schema: { type: string, maxLength: 100 }
 *         description: Case/collation-dependent substring search of file names
 *       - in: query
 *         name: sort
 *         schema: { type: string, enum: [created_at, updated_at, file_name, file_size], default: created_at }
 *       - in: query
 *         name: direction
 *         schema: { type: string, enum: [ASC, DESC], default: DESC }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, minimum: 1, maximum: 100, default: 25 }
 *       - in: query
 *         name: cursor
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: List of files
 * 
 * /api/files/{id}/download:
 *   get:
 *     summary: Get S3 Presigned Download URL
 *     tags:
 *       - Files
 *     security:
 *       - sessionCookie: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Presigned URL generated
 * 
 * /api/files/{id}:
 *   put:
 *     summary: Rename file
 *     tags:
 *       - Files
 *     security:
 *       - sessionCookie: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [file_name]
 *             properties:
 *               file_name: { type: string, example: "report-2026.pdf" }
 *     responses:
 *       200:
 *         description: File renamed
 *   delete:
 *     summary: Move a ready file to trash (quota is retained)
 *     tags:
 *       - Files
 *     security:
 *       - sessionCookie: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: File moved to trash
 *
 * /api/files/trash:
 *   get:
 *     summary: List trash with cursor pagination
 *     tags: [Files]
 *     security:
 *       - sessionCookie: []
 *     parameters:
 *       - in: query
 *         name: status
 *         schema: { type: string, enum: [ALL, TRASHED, PURGE_PENDING], default: ALL }
 *       - in: query
 *         name: search
 *         schema: { type: string, maxLength: 100 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, minimum: 1, maximum: 100, default: 25 }
 *       - in: query
 *         name: cursor
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Paginated trash items
 *
 * /api/files/{id}/restore:
 *   post:
 *     summary: Restore a trashed file before purge starts
 *     tags: [Files]
 *     security:
 *       - sessionCookie: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: File restored
 *       409:
 *         description: Purge has already started
 *
 * /api/files/{id}/permanent:
 *   delete:
 *     summary: Request permanent deletion of a trashed file
 *     tags: [Files]
 *     security:
 *       - sessionCookie: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       202:
 *         description: Purge request accepted for asynchronous processing
 * 
 * /api/files/{id}/move:
 *   put:
 *     summary: Move file to another folder or root
 *     tags:
 *       - Files
 *     security:
 *       - sessionCookie: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               folder_id: { type: string, nullable: true, example: null }
 *     responses:
 *       200:
 *         description: File moved
 *
 * /api/activity:
 *   get:
 *     summary: List the calling user's audit activity
 *     tags:
 *       - Activity
 *     security:
 *       - sessionCookie: []
 *     parameters:
 *       - in: query
 *         name: limit
 *         schema: { type: integer, minimum: 1, maximum: 100, default: 25 }
 *       - in: query
 *         name: cursor
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: The caller's safe audit events only
 *
 * /api/uploads:
 *   post:
 *     summary: Reserve quota and issue a short-lived direct S3 POST contract
 *     tags: [Uploads]
 *     security:
 *       - sessionCookie: []
 *     parameters:
 *       - in: header
 *         name: Idempotency-Key
 *         required: true
 *         schema: { type: string, maxLength: 255 }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [requested_size, declared_mime_type]
 *             properties:
 *               requested_size: { type: integer, minimum: 1, maximum: 52428800 }
 *               declared_mime_type: { type: string, enum: [application/pdf, image/jpeg, image/png, text/plain] }
 *               folder_id: { type: string, nullable: true }
 *     responses:
 *       201: { description: Upload session plus server-selected presigned POST URL and fields }
 *       409: { description: Quota, active-session limit, or idempotency conflict }
 *
 * /api/uploads/{id}/complete:
 *   post:
 *     summary: Bind one uploaded S3 object version after server-side HEAD verification
 *     tags: [Uploads]
 *     security:
 *       - sessionCookie: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [versionId]
 *             properties:
 *               versionId: { type: string, maxLength: 1024 }
 *     responses:
 *       200: { description: Version bound and awaiting validation }
 *       409: { description: Expired session, missing/mismatched object, or version conflict }
 *
 * /api/uploads/{id}:
 *   get:
 *     summary: Get an upload session owned by the caller
 *     tags: [Uploads]
 *     security:
 *       - sessionCookie: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: Upload session }
 *       404: { description: Session not found or not owned by caller }
 *
 * /api/storage/usage:
 *   get:
 *     summary: Get the calling user's storage counters
 *     tags: [Storage]
 *     security:
 *       - sessionCookie: []
 *     responses:
 *       200: { description: Exact decimal-string quota, used, reserved, and available byte counters }
 */
