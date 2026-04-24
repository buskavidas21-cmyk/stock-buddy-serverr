import mongoose from 'mongoose';

const parseList = (value: string | undefined) =>
  (value || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

/** MongoDB ObjectIds allowed to hold the audits role (comma-separated in env). */
export const getAllowedAuditUserIds = (): string[] => parseList(process.env.AUDIT_ALLOWED_USER_IDS);

/** Emails allowed to hold the audits role (comma-separated, case-insensitive). */
export const getAllowedAuditEmails = (): string[] =>
  parseList(process.env.AUDIT_ALLOWED_EMAILS).map((e) => e.toLowerCase());

export const isAuditRoleEligible = (user: {
  _id: unknown;
  email: string;
}): boolean => {
  const ids = getAllowedAuditUserIds();
  const emails = getAllowedAuditEmails();
  if (ids.length === 0 && emails.length === 0) {
    return false;
  }
  const idStr = String(user._id);
  if (ids.some((id) => id === idStr)) {
    return true;
  }
  const mail = user.email?.toLowerCase() || '';
  return emails.includes(mail);
};
