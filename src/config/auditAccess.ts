export const isAuditRoleEligible = (user: {
  isAuditApproved?: boolean;
}): boolean => {
  return Boolean(user.isAuditApproved);
};
