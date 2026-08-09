import { expect, test, type Page } from "@playwright/test";

/**
 * Full vertical-slice loop with two isolated browser contexts (= two
 * players): create → join → ready → synchronized Quickdraw → round results
 * → match result → rematch. Requires Supabase env vars in .env.local.
 */

test.describe("two-player match flow", () => {
  test("create, join, play a full quick match, rematch", async ({ browser }) => {
    const ctxA = await browser.newContext();
    const ctxB = await browser.newContext();
    const alice = await ctxA.newPage();
    const bob = await ctxB.newPage();

    // Alice creates a room.
    await alice.goto("/");
    await alice.getByLabel("Your name").fill("Alice");
    await alice.getByRole("button", { name: "Create a room" }).click();
    await alice.waitForURL(/\/room\/[A-Z2-9]{6}/, { timeout: 20000 });
    const code = alice.url().split("/room/")[1].slice(0, 6);

    // Her room code is on screen and the lobby shows her seat.
    await expect(alice.getByText(code).first()).toBeVisible();
    await expect(alice.getByText("Alice").first()).toBeVisible();

    // Bob joins with the code.
    await bob.goto(`/room/${code}`);
    await bob.getByLabel("Your name").fill("Bob");
    await bob.getByRole("button", { name: "Enter room" }).click();

    // Presence: each sees the other.
    await expect(bob.getByText("Alice").first()).toBeVisible({ timeout: 20000 });
    await expect(alice.getByText("Bob").first()).toBeVisible({ timeout: 20000 });

    // Both ready up → countdown → Quickdraw round 1.
    await alice.getByRole("button", { name: "Ready up" }).click();
    await bob.getByRole("button", { name: "Ready up" }).click();
    await expect(alice.getByText("Round 1 of 3")).toBeVisible({ timeout: 30000 });
    await expect(bob.getByText("Round 1 of 3")).toBeVisible({ timeout: 30000 });

    // Play until the match completes: click whenever CLICK! shows up.
    await Promise.all([playQuickdraw(alice), playQuickdraw(bob)]);

    await expect(alice.getByText("Match complete")).toBeVisible({ timeout: 30000 });
    await expect(bob.getByText("Match complete")).toBeVisible({ timeout: 30000 });
    // A winner banner (or a draw) is shown.
    await expect(alice.getByText(/WINS|PERFECT DRAW/).first()).toBeVisible();

    // Rematch: both ready again from the result screen.
    await alice.getByRole("button", { name: "Rematch" }).click();
    await bob.getByRole("button", { name: "Rematch" }).click();
    await expect(alice.getByText("Round 1 of 3")).toBeVisible({ timeout: 30000 });
    await expect(bob.getByText("Round 1 of 3")).toBeVisible({ timeout: 30000 });

    await ctxA.close();
    await ctxB.close();
  });

  test("joining a nonexistent room shows a friendly error", async ({ page }) => {
    await page.goto("/");
    await page.getByLabel("Your name").fill("Zoe");
    await page.getByRole("button", { name: "Join room" }).first().click();
    await page.getByLabel("Room code").fill("ZZZZZZ");
    await page.getByRole("button", { name: "Join room" }).last().click();
    await expect(page.getByText("Room not found")).toBeVisible({ timeout: 20000 });
  });
});

/** Click the play area whenever the go-signal is visible, until match end. */
async function playQuickdraw(page: Page): Promise<void> {
  const deadline = Date.now() + 4 * 60 * 1000;
  const zone = page.locator('[aria-label^="Quickdraw play area"]');
  const goSignal = page.getByText("CLICK!", { exact: true });
  const done = page.getByText("Match complete");

  while (Date.now() < deadline) {
    if (await done.isVisible().catch(() => false)) return;
    if (
      (await goSignal.isVisible().catch(() => false)) &&
      (await zone.isVisible().catch(() => false))
    ) {
      await zone.click({ force: true, timeout: 2000 }).catch(() => {});
    }
    await page.waitForTimeout(80);
  }
  throw new Error("Match did not complete within the time limit");
}
