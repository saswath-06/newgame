import { expect, test } from "@playwright/test";

/**
 * Drives a real camera game end to end with Chromium's fake webcam. The
 * synthetic feed has no human in it, so no landmarks are produced — which
 * is exactly the "player out of frame" case. The game must still run its
 * schedule, submit a result, and let the match advance rather than hang.
 */
test.use({
  launchOptions: {
    args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"],
  },
  permissions: ["camera"],
});

test.describe("physical games", () => {
  test("Freeze runs its full schedule and resolves the round", async ({ browser }) => {
    const ctxA = await browser.newContext();
    const ctxB = await browser.newContext();
    const alice = await ctxA.newPage();
    const bob = await ctxB.newPage();

    const errors: string[] = [];
    for (const page of [alice, bob]) {
      page.on("pageerror", (e) => errors.push(String(e)));
      await page.addInitScript(() => {
        window.sessionStorage.setItem("duoarcade:forceGames", "freeze");
      });
    }

    await alice.goto("/");
    await alice.getByLabel("Your name").fill("Fay");
    await alice.getByRole("button", { name: "Create a room" }).click();
    await alice.waitForURL(/\/room\/[A-Z2-9]{6}/, { timeout: 20000 });
    const code = alice.url().split("/room/")[1].slice(0, 6);

    await bob.goto(`/room/${code}`);
    await bob.getByLabel("Your name").fill("Fin");
    await bob.getByRole("button", { name: "Enter room" }).click();
    await expect(alice.getByText("Fin").first()).toBeVisible({ timeout: 20000 });

    // Both have a (fake) camera, so physical games are eligible.
    await expect(
      alice.getByText(/Camera games are sitting this one out/),
    ).toHaveCount(0);

    // Custom / best of 1 keeps the match to a single round.
    await alice.getByRole("button", { name: /Custom/ }).click();
    await alice.getByRole("button", { name: "Best of 1" }).click();

    await alice.getByRole("button", { name: "Ready up" }).click();
    await bob.getByRole("button", { name: "Ready up" }).click();

    // The camera game mounts on both sides.
    await expect(alice.getByText("Freeze!").first()).toBeVisible({ timeout: 30000 });
    await expect(alice.getByText("Hold still…")).toBeVisible({ timeout: 60000 });

    // Calibration gives way to the first MOVE! phase.
    await expect(alice.getByText("MOVE!")).toBeVisible({ timeout: 30000 });
    await expect(alice.getByText("FREEZE!")).toBeVisible({ timeout: 30000 });

    // The full schedule completes and the match reaches its result screen.
    await expect(alice.getByText("Match complete")).toBeVisible({ timeout: 120000 });
    await expect(bob.getByText("Match complete")).toBeVisible({ timeout: 30000 });

    expect(errors).toEqual([]);
    await ctxA.close();
    await ctxB.close();
  });
});
