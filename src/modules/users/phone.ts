/** 7-15 digits, optional leading +, single space/dot/hyphen separators (e.g. 0901 234 567). */
export const PHONE_PATTERN = /^\+?(?:\d[ .-]?){6,14}\d$/;
export const PHONE_MESSAGE = 'phone must contain 7-15 digits, optionally starting with +';
