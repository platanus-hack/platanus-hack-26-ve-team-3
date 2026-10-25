import type { Page } from "@playwright/test";

/** Abre un `<details>` si está cerrado (tocar el summary de uno abierto lo cerraría). */
async function ensureOpen(page: Page, testId: string) {
  const el = page.getByTestId(testId);
  if (!(await el.evaluate((d) => (d as HTMLDetailsElement).open))) await el.locator(":scope > summary").click();
}

/**
 * Panel del organizador: despliega «Más» y, dentro, una sección
 * (`cases` · `room` · `voters` · `candidates` · `token` · `links`).
 */
export async function openMore(page: Page, section?: "cases" | "room" | "voters" | "candidates" | "token" | "links") {
  await ensureOpen(page, "more-sheet");
  if (section) await ensureOpen(page, `more-${section}`);
}
