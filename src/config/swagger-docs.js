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
 *     summary: Delete file from S3 and MySQL
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
 *         description: File deleted
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
 */
