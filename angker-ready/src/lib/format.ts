export const money = (v: unknown) => `$${Number(v ?? 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 4 })}`;
export const dt = (v: string | Date) => new Date(v).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" });
