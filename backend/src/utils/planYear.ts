export function getPlanYearStart(
  userPolicy: { startDate: Date; planYearType: string },
  referenceDate: Date,
): Date {
  if (userPolicy.planYearType === 'ANNIVERSARY') {
    const start = userPolicy.startDate;
    // Find the most recent anniversary on or before referenceDate
    let anniversary = new Date(referenceDate.getFullYear(), start.getMonth(), start.getDate());
    if (anniversary > referenceDate) {
      anniversary = new Date(referenceDate.getFullYear() - 1, start.getMonth(), start.getDate());
    }
    return anniversary;
  }
  // CALENDAR: January 1 of the reference year
  return new Date(referenceDate.getFullYear(), 0, 1);
}
