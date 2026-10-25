/** Local Zimbabwe calendar date, regardless of device timezone. */
export function zimTodayISO(): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Africa/Harare", year: "numeric", month: "2-digit", day: "2-digit"
  }).formatToParts(new Date());
  const value = (part: string) => parts.find((x) => x.type === part)?.value ?? "";
  return [value("year"),value("month"),value("day")].join("-");
}
