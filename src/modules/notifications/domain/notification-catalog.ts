export const NOTIFICATION_CATALOG = {
  SESSION_RESCHEDULED: ['SCHEDULE', 'Lịch học thay đổi', 'Một buổi học của bạn đã đổi lịch.'],
  SESSION_MENTOR_CHANGED: [
    'SCHEDULE',
    'Phân công giảng dạy thay đổi',
    'Mentor của một buổi học đã thay đổi.',
  ],
  SESSION_CANCELLED: ['SCHEDULE', 'Buổi học bị hủy', 'Một buổi học của bạn đã bị hủy.'],
  CLASS_CANCELLED: ['SCHEDULE', 'Lớp học bị hủy', 'Một lớp học của bạn đã bị hủy.'],
  MAKEUP_SESSION_SCHEDULED: ['SCHEDULE', 'Có lịch học bù', 'Một buổi học bù đã được xếp lịch.'],
  ASSIGNMENT_PUBLISHED: ['ASSIGNMENT', 'Bài tập mới', 'Có bài tập mới dành cho bạn.'],
  ASSIGNMENT_DEADLINE_CHANGED: [
    'ASSIGNMENT',
    'Hạn nộp thay đổi',
    'Hạn nộp một bài tập đã thay đổi.',
  ],
  ASSIGNMENT_GRADE_RELEASED: [
    'ASSIGNMENT',
    'Đã công bố kết quả',
    'Kết quả bài nộp của bạn đã được công bố.',
  ],
  ZIP_SUBMISSION_REVIEW_REQUIRED: [
    'ASSIGNMENT',
    'Có bài cần chấm',
    'Một bài ZIP đã được nộp và cần chấm.',
  ],
  PAYMENT_CONFIRMED: [
    'PAYMENT',
    'Thanh toán thành công',
    'Thanh toán đơn hàng của bạn đã được xác nhận.',
  ],
  ORDER_EXPIRING: ['PAYMENT', 'Đơn hàng sắp hết hạn', 'Vui lòng kiểm tra đơn hàng sắp hết hạn.'],
  ORDER_EXPIRED: ['PAYMENT', 'Đơn hàng đã hết hạn', 'Một đơn hàng của bạn đã hết hạn.'],
  MENTOR_LEAVE_REQUESTED: ['LEAVE_MAKEUP', 'Có đơn nghỉ dạy', 'Có đơn nghỉ dạy cần xử lý.'],
  MENTOR_LEAVE_APPROVED: [
    'LEAVE_MAKEUP',
    'Đơn nghỉ đã được duyệt',
    'Đơn nghỉ dạy của bạn đã được duyệt.',
  ],
  MENTOR_LEAVE_REJECTED: [
    'LEAVE_MAKEUP',
    'Đơn nghỉ bị từ chối',
    'Đơn nghỉ dạy của bạn đã bị từ chối.',
  ],
  MAKEUP_PLACEMENT_CREATED: ['LEAVE_MAKEUP', 'Đã xếp chỗ học bù', 'Một chỗ học bù đã được xếp.'],
  MAKEUP_PLACEMENT_CANCELLED: ['LEAVE_MAKEUP', 'Đã hủy chỗ học bù', 'Một chỗ học bù đã bị hủy.'],
  MATERIAL_PUBLISHED: ['MATERIAL', 'Tài liệu mới', 'Có tài liệu mới dành cho bạn.'],
  MATERIAL_REVIEW_APPROVED: ['MATERIAL', 'Tài liệu được duyệt', 'Tài liệu bạn gửi đã được duyệt.'],
  MATERIAL_REVIEW_REJECTED: [
    'MATERIAL',
    'Tài liệu bị từ chối',
    'Tài liệu bạn gửi cần được xem lại.',
  ],
  SESSION_STARTING_SOON: ['SCHEDULE', 'Buổi học sắp bắt đầu', 'Một buổi học của bạn sắp bắt đầu.'],
  ASSIGNMENT_DUE_SOON: [
    'ASSIGNMENT',
    'Bài tập sắp đến hạn',
    'Một bài tập của bạn sắp đến hạn nộp.',
  ],
} as const;

export type BusinessNotificationType = keyof typeof NOTIFICATION_CATALOG;
export const NOTIFICATION_CATEGORIES = [
  'ALL',
  'BUSINESS',
  'CHAT',
  'SCHEDULE',
  'ASSIGNMENT',
  'PAYMENT',
  'LEAVE_MAKEUP',
  'MATERIAL',
] as const;
export type NotificationCategory = (typeof NOTIFICATION_CATEGORIES)[number];
export function isBusinessType(type: string): type is BusinessNotificationType {
  return Object.hasOwn(NOTIFICATION_CATALOG, type);
}
