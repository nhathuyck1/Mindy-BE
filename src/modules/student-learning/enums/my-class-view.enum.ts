export enum MyClassView {
  /** ACTIVE/COMPLETED enrollments and unexpired holds of a still PENDING own order. */
  CURRENT = 'current',
  /** Everything else: cancelled enrollments, expired or closed holds, inconsistent rows. */
  HISTORY = 'history',
  ALL = 'all',
}
