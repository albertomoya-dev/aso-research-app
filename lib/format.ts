const number = new Intl.NumberFormat("es-ES");
const rating = new Intl.NumberFormat("es-ES", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const day = new Intl.DateTimeFormat("es-ES", { day: "numeric", month: "short", year: "numeric" });

export const formatNumber = (n: number | null | undefined) => (n == null ? "–" : number.format(n));
export const formatRating = (n: number | null | undefined) => (n == null ? "–" : `★ ${rating.format(n)}`);
export const formatDate = (iso: string | Date | null | undefined) => (iso ? day.format(new Date(iso)) : "–");
const shortDay = new Intl.DateTimeFormat("es-ES", { day: "numeric", month: "short", timeZone: "UTC" });
/** "26 oct", for a YYYY-MM-DD date. */
export const formatDay = (iso: string | null | undefined) => (iso ? shortDay.format(new Date(`${iso.slice(0, 10)}T00:00:00Z`)) : "–");
