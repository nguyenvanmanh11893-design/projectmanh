document.addEventListener('DOMContentLoaded', () => {
  // Global State
  let authToken = localStorage.getItem('token') || null;
  let currentUser = null;
  let currentFolderId = null; // null means Root
  let breadcrumbStack = [{ id: null, name: 'My Drive' }];

  // DOM Elements
  const authContainer = document.getElementById('authContainer');
  const appContainer = document.getElementById('appContainer');
  const loginFormSection = document.getElementById('loginFormSection');
  const registerFormSection = document.getElementById('registerFormSection');

  const loginForm = document.getElementById('loginForm');
  const registerForm = document.getElementById('registerForm');
  const toggleToRegister = document.getElementById('toggleToRegister');
  const toggleToLogin = document.getElementById('toggleToLogin');

  const folderGrid = document.getElementById('folderGrid');
  const fileTableBody = document.getElementById('fileTableBody');
  const breadcrumbNav = document.getElementById('breadcrumbNav');

  const userDisplayName = document.getElementById('userDisplayName');
  const userDisplayEmail = document.getElementById('userDisplayEmail');
  const logoutBtn = document.getElementById('logoutBtn');

  // Modals
  const createFolderModal = document.getElementById('createFolderModal');
  const uploadFileModal = document.getElementById('uploadFileModal');
  const renameModal = document.getElementById('renameModal');
  const profileModal = document.getElementById('profileModal');

  // Modal Triggers
  document.getElementById('btnCreateFolderModal').addEventListener('click', () => openModal(createFolderModal));
  document.getElementById('btnUploadFileModal').addEventListener('click', () => openModal(uploadFileModal));
  document.getElementById('openProfileModal').addEventListener('click', (e) => {
    if (e.target.closest('#logoutBtn')) return;
    openModal(profileModal);
  });

  document.querySelectorAll('.closeModalBtn').forEach(btn => {
    btn.addEventListener('click', () => closeModal(btn.closest('.modal')));
  });

  // Initialize Lucide Icons
  const refreshIcons = () => lucide.createIcons();

  // Helper Functions
  function openModal(modal) { modal.classList.remove('hidden'); }
  function closeModal(modal) { modal.classList.add('hidden'); }

  function formatBytes(bytes, decimals = 2) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
  }

  // API Call Wrapper
  async function apiFetch(endpoint, options = {}) {
    const headers = options.headers || {};
    if (authToken) {
      headers['Authorization'] = `Bearer ${authToken}`;
    }
    if (!(options.body instanceof FormData)) {
      headers['Content-Type'] = 'application/json';
    }

    try {
      const response = await fetch(endpoint, { ...options, headers });
      const data = await response.json();

      if (!response.ok) {
        if (response.status === 401) {
          logout();
        }
        throw new Error(data.message || 'API request failed');
      }

      return data;
    } catch (err) {
      alert(`[Error]: ${err.message}`);
      throw err;
    }
  }

  // AUTHENTICATION LOGIC
  toggleToRegister.addEventListener('click', () => {
    loginFormSection.classList.add('hidden');
    registerFormSection.classList.remove('hidden');
  });

  toggleToLogin.addEventListener('click', () => {
    registerFormSection.classList.add('hidden');
    loginFormSection.classList.remove('hidden');
  });

  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const username = document.getElementById('loginUsername').value;
    const password = document.getElementById('loginPassword').value;

    try {
      const res = await apiFetch('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ username, password })
      });

      authToken = res.data.token;
      currentUser = res.data.user;
      localStorage.setItem('token', authToken);

      initApp();
    } catch (err) {
      console.error(err);
    }
  });

  registerForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const full_name = document.getElementById('regFullName').value;
    const username = document.getElementById('regUsername').value;
    const email = document.getElementById('regEmail').value;
    const password = document.getElementById('regPassword').value;

    try {
      await apiFetch('/api/auth/register', {
        method: 'POST',
        body: JSON.stringify({ full_name, username, email, password })
      });

      alert('Registration successful! Please sign in.');
      toggleToLogin.click();
    } catch (err) {
      console.error(err);
    }
  });

  logoutBtn.addEventListener('click', logout);

  function logout() {
    authToken = null;
    currentUser = null;
    localStorage.removeItem('token');
    appContainer.classList.add('hidden');
    authContainer.classList.remove('hidden');
  }

  async function checkAuth() {
    if (!authToken) {
      authContainer.classList.remove('hidden');
      return;
    }

    try {
      const res = await apiFetch('/api/auth/me');
      currentUser = res.data;
      initApp();
    } catch (err) {
      logout();
    }
  }

  function initApp() {
    authContainer.classList.add('hidden');
    appContainer.classList.remove('hidden');

    userDisplayName.textContent = currentUser.full_name || currentUser.username;
    userDisplayEmail.textContent = currentUser.email;
    document.getElementById('profileFullName').value = currentUser.full_name || '';

    loadDriveContents();
  }

  // FOLDER & FILE NAVIGATION LOGIC
  async function loadDriveContents() {
    renderBreadcrumb();

    if (currentFolderId === null) {
      // Root View
      const foldersRes = await apiFetch('/api/folders');
      const filesRes = await apiFetch('/api/files');
      renderFolders(foldersRes.data);
      renderFiles(filesRes.data);
    } else {
      // Subfolder View
      const folderRes = await apiFetch(`/api/folders/${currentFolderId}`);
      renderFolders(folderRes.data.subfolders || []);
      renderFiles(folderRes.data.files || []);
    }
  }

  function renderBreadcrumb() {
    breadcrumbNav.innerHTML = '';
    breadcrumbStack.forEach((item, index) => {
      const span = document.createElement('span');
      span.className = 'breadcrumb-item';
      span.textContent = item.name;
      span.addEventListener('click', () => {
        breadcrumbStack = breadcrumbStack.slice(0, index + 1);
        currentFolderId = item.id;
        loadDriveContents();
      });

      breadcrumbNav.appendChild(span);
      if (index < breadcrumbStack.length - 1) {
        const sep = document.createElement('span');
        sep.textContent = ' / ';
        sep.style.color = 'var(--text-muted)';
        breadcrumbNav.appendChild(sep);
      }
    });
  }

  function renderFolders(folders) {
    folderGrid.innerHTML = '';
    if (folders.length === 0) {
      folderGrid.innerHTML = `<div style="color:var(--text-muted); font-size:0.9rem;">No folders inside</div>`;
      return;
    }

    folders.forEach(folder => {
      const card = document.createElement('div');
      card.className = 'folder-card';
      card.innerHTML = `
        <div class="folder-info">
          <i data-lucide="folder" style="color: var(--accent-blue);"></i>
          <span class="folder-name"></span>
        </div>
        <div class="action-btns">
          <button class="icon-btn rename-folder-btn" title="Rename"><i data-lucide="edit-2"></i></button>
          <button class="icon-btn delete-folder-btn" title="Delete"><i data-lucide="trash-2"></i></button>
        </div>
      `;
      card.querySelector('.folder-name').textContent = folder.name;

      // Open Folder
      card.addEventListener('click', (e) => {
        if (e.target.closest('.action-btns')) return;
        currentFolderId = folder.id;
        breadcrumbStack.push({ id: folder.id, name: folder.name });
        loadDriveContents();
      });

      // Rename Folder
      card.querySelector('.rename-folder-btn').addEventListener('click', (e) => {
        e.stopPropagation();
        openRenameModal('folder', folder.id, folder.name);
      });

      // Delete Folder
      card.querySelector('.delete-folder-btn').addEventListener('click', async (e) => {
        e.stopPropagation();
        if (confirm(`Are you sure you want to delete folder "${folder.name}"?`)) {
          await apiFetch(`/api/folders/${folder.id}`, { method: 'DELETE' });
          loadDriveContents();
        }
      });

      folderGrid.appendChild(card);
    });
    refreshIcons();
  }

  function renderFiles(files) {
    fileTableBody.innerHTML = '';
    if (files.length === 0) {
      fileTableBody.innerHTML = `<tr><td colspan="4" style="color:var(--text-muted); text-align:center;">No files uploaded yet</td></tr>`;
      return;
    }

    files.forEach(file => {
      const tr = document.createElement('tr');
      const formattedSize = formatBytes(parseInt(file.file_size || 0, 10));
      const formattedDate = new Date(file.created_at).toLocaleDateString();

      tr.innerHTML = `
        <td>
          <div class="file-name-cell">
            <i data-lucide="file-text" style="color:var(--accent-blue);"></i>
            <span class="file-name"></span>
          </div>
        </td>
        <td>${formattedSize}</td>
        <td>${formattedDate}</td>
        <td style="text-align:right;">
          <div class="action-btns" style="justify-content:flex-end;">
            <button class="icon-btn download-file-btn" title="Download"><i data-lucide="download"></i></button>
            <button class="icon-btn rename-file-btn" title="Rename"><i data-lucide="edit-2"></i></button>
            <button class="icon-btn delete-file-btn" title="Delete"><i data-lucide="trash-2"></i></button>
          </div>
        </td>
      `;
      tr.querySelector('.file-name').textContent = file.file_name;

      // Download Presigned URL
      tr.querySelector('.download-file-btn').addEventListener('click', async () => {
        const res = await apiFetch(`/api/files/${file.id}/download`);
        if (res.data && res.data.download_url) {
          window.open(res.data.download_url, '_blank');
        }
      });

      // Rename File
      tr.querySelector('.rename-file-btn').addEventListener('click', () => {
        openRenameModal('file', file.id, file.file_name);
      });

      // Delete File
      tr.querySelector('.delete-file-btn').addEventListener('click', async () => {
        if (confirm(`Delete file "${file.file_name}"?`)) {
          await apiFetch(`/api/files/${file.id}`, { method: 'DELETE' });
          loadDriveContents();
        }
      });

      fileTableBody.appendChild(tr);
    });
    refreshIcons();
  }

  // CREATE FOLDER FORM
  document.getElementById('createFolderForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = document.getElementById('folderNameInput').value;

    await apiFetch('/api/folders', {
      method: 'POST',
      body: JSON.stringify({ name, parent_id: currentFolderId })
    });

    closeModal(createFolderModal);
    document.getElementById('folderNameInput').value = '';
    loadDriveContents();
  });

  // UPLOAD FILE FORM
  document.getElementById('uploadFileForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const fileInput = document.getElementById('fileInput');
    if (!fileInput.files[0]) return;

    const formData = new FormData();
    formData.append('file', fileInput.files[0]);
    if (currentFolderId) {
      formData.append('folder_id', currentFolderId);
    }

    await apiFetch('/api/files/upload', {
      method: 'POST',
      body: formData
    });

    closeModal(uploadFileModal);
    fileInput.value = '';
    loadDriveContents();
  });

  // RENAME ITEM FORM
  function openRenameModal(type, id, currentName) {
    document.getElementById('renameItemType').value = type;
    document.getElementById('renameItemId').value = id;
    document.getElementById('renameInput').value = currentName;
    document.getElementById('renameModalTitle').textContent = `Rename ${type === 'folder' ? 'Folder' : 'File'}`;
    openModal(renameModal);
  }

  document.getElementById('renameForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const type = document.getElementById('renameItemType').value;
    const id = document.getElementById('renameItemId').value;
    const newName = document.getElementById('renameInput').value;

    if (type === 'folder') {
      await apiFetch(`/api/folders/${id}`, {
        method: 'PUT',
        body: JSON.stringify({ name: newName })
      });
    } else {
      await apiFetch(`/api/files/${id}`, {
        method: 'PUT',
        body: JSON.stringify({ file_name: newName })
      });
    }

    closeModal(renameModal);
    loadDriveContents();
  });

  // PROFILE & PASSWORD FORM
  document.getElementById('updateProfileForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const full_name = document.getElementById('profileFullName').value;
    const res = await apiFetch('/api/users/me', {
      method: 'PUT',
      body: JSON.stringify({ full_name })
    });
    currentUser = res.data;
    userDisplayName.textContent = currentUser.full_name || currentUser.username;
    alert('Profile updated successfully');
  });

  document.getElementById('changePasswordForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const current_password = document.getElementById('currentPassword').value;
    const new_password = document.getElementById('newPassword').value;

    await apiFetch('/api/users/me/password', {
      method: 'PUT',
      body: JSON.stringify({ current_password, new_password })
    });

    alert('Password changed successfully!');
    document.getElementById('currentPassword').value = '';
    document.getElementById('newPassword').value = '';
    closeModal(profileModal);
  });

  // Start App Check
  checkAuth();
});
