/** What a student may read about one enrolled class at the moment of the response. */
export enum LearningAccessMode {
  /** ACTIVE enrollment: full class detail (incl. meeting URL) and personal schedule. */
  FULL = 'FULL',
  /** Unexpired pending CASH hold: titles, timetable and room only; no meeting URL. */
  CASH_PREVIEW = 'CASH_PREVIEW',
  /** Summary/history only: no private class detail and no schedule events. */
  NONE = 'NONE',
}
