const { Folder, File } = require('../models');

/**
 * Create a new folder
 */
const createFolder = async (userId, { name, parent_id }) => {
  if (!name || name.trim() === '') {
    const err = new Error('Folder name is required');
    err.statusCode = 400;
    throw err;
  }

  const cleanName = name.trim();

  // If parent_id is provided, check if it exists and belongs to this user
  if (parent_id) {
    const parentFolder = await Folder.findOne({
      where: { id: parent_id, user_id: userId }
    });

    if (!parentFolder) {
      const err = new Error('Parent folder not found or access denied');
      err.statusCode = 404;
      throw err;
    }
  }

  const newFolder = await Folder.create({
    user_id: userId,
    parent_id: parent_id || null,
    name: cleanName
  });

  return newFolder;
};

/**
 * Get root folders for the user (parent_id = null)
 */
const getRootFolders = async (userId) => {
  const folders = await Folder.findAll({
    where: {
      user_id: userId,
      parent_id: null
    },
    order: [['name', 'ASC']]
  });

  return folders;
};

/**
 * Get folder details including subfolders and files
 */
const getFolderById = async (userId, folderId) => {
  const folder = await Folder.findOne({
    where: {
      id: folderId,
      user_id: userId
    },
    include: [
      {
        model: Folder,
        as: 'subfolders',
        order: [['name', 'ASC']]
      },
      {
        model: File,
        as: 'files',
        where: { status: 'completed' },
        required: false,
        order: [['file_name', 'ASC']]
      }
    ]
  });

  if (!folder) {
    const err = new Error('Folder not found or access denied');
    err.statusCode = 404;
    throw err;
  }

  return folder;
};

/**
 * Rename folder
 */
const renameFolder = async (userId, folderId, { name }) => {
  if (!name || name.trim() === '') {
    const err = new Error('New folder name is required');
    err.statusCode = 400;
    throw err;
  }

  const folder = await Folder.findOne({
    where: {
      id: folderId,
      user_id: userId
    }
  });

  if (!folder) {
    const err = new Error('Folder not found or access denied');
    err.statusCode = 404;
    throw err;
  }

  folder.name = name.trim();
  await folder.save();

  return folder;
};

/**
 * Delete folder safely
 */
const deleteFolder = async (userId, folderId) => {
  const folder = await Folder.findOne({
    where: {
      id: folderId,
      user_id: userId
    }
  });

  if (!folder) {
    const err = new Error('Folder not found or access denied');
    err.statusCode = 404;
    throw err;
  }

  // Deleting folder will cascade delete subfolders due to FK constraint,
  // and set files' folder_id to NULL or CASCADE based on design.
  await folder.destroy();
  return true;
};

module.exports = {
  createFolder,
  getRootFolders,
  getFolderById,
  renameFolder,
  deleteFolder
};
