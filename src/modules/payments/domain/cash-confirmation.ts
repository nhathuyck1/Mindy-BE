/** New collections record the manager; historical mentor confirmations remain valid. */
export function isCashConfirmation(
  reference: string | null,
  orderId: string,
  legacyMentorId: string | null,
): boolean {
  if (!reference) return false;
  if (legacyMentorId && reference === `cash:${legacyMentorId}:${orderId}`) return true;
  const [kind, actorId, confirmedOrderId, extra] = reference.split(':');
  return (
    kind === 'cash-manager' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(actorId ?? '') &&
    confirmedOrderId === orderId &&
    extra === undefined
  );
}
