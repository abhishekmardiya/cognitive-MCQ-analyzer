const IST_FORMATTER = new Intl.DateTimeFormat("en-IN", {
  timeZone: "Asia/Kolkata",
  dateStyle: "medium",
  timeStyle: "medium",
});

/** Human-readable timestamp in India Standard Time (for PDF and UI). */
export function formatGeneratedTimestampIst(isoUtc: string): string {
  const d = new Date(isoUtc);
  if (Number.isNaN(d.getTime())) {
    return isoUtc;
  }
  return `${IST_FORMATTER.format(d)} IST`;
}
