export function formatBytes(bytes?: number | string | null): string {
  const n = Number(bytes || 0);
  if (!n || isNaN(n)) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.min(Math.floor(Math.log(n) / Math.log(1024)), units.length - 1);
  return `${(n / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

export function formatDate(dateString?: string | null): string {
  if (!dateString) return '-';
  try {
    const d = new Date(dateString);
    if (isNaN(d.getTime())) return '-';
    return d.toLocaleString('vi-VN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  } catch {
    return dateString;
  }
}

export function formatFileStatus(status: string): { label: string; color: string } {
  switch (status) {
    case 'READY':
      return { label: 'Sẵn sàng', color: 'success' };
    case 'LEGACY_UNVERIFIED':
      return { label: 'Chưa xác thực', color: 'warning' };
    case 'TRASHED':
      return { label: 'Thùng rác', color: 'error' };
    case 'PURGE_PENDING':
      return { label: 'Chờ xóa vĩnh viễn', color: 'volcano' };
    case 'PURGED':
      return { label: 'Đã xóa', color: 'default' };
    default:
      return { label: status, color: 'default' };
  }
}

export function formatActivityAction(action: string): string {
  switch (action) {
    case 'file.uploaded':
      return 'Tải lên tệp';
    case 'file.renamed':
      return 'Đổi tên tệp';
    case 'file.moved':
      return 'Di chuyển tệp';
    case 'file.trashed':
      return 'Đưa vào thùng rác';
    case 'file.restored':
      return 'Khôi phục tệp';
    case 'file.deleted':
      return 'Xóa tệp';
    case 'file.purge_requested':
      return 'Yêu cầu xóa vĩnh viễn';
    case 'folder.created':
      return 'Tạo thư mục';
    case 'folder.renamed':
      return 'Đổi tên thư mục';
    case 'folder.deleted':
      return 'Xóa thư mục';
    case 'user.login':
      return 'Đăng nhập';
    case 'user.logout':
      return 'Đăng xuất';
    default:
      return action;
  }
}
