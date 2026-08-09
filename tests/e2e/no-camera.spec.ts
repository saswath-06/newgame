import { expect, test } from "@playwright/test";

/**
 * A machine without a webcam must still play everything. Physical games
 * are kept out of selection entirely when either player lacks a camera,
 * so the match plays through with arcade games only and never stalls on
 * a black video element.
 *
 * Chromium is launched WITHOUT the fake-device flags, so enumerateDevices
 * reports no video input — the real no-camera condition.
 */
test.describe("no-camera devices", () => {
  test("a full match runs with arcade games only", async ({ browser }) => {
    const ctxA = await browser.newContext();
    const ctxB = await browser.newContext();
    const alice = await ctxA.newPage();
    const bob = await ctxB.newPage();

    // Simulate hardware with no camera at all.
    for (const page of [alice, bob]) {
      await page.addInitScript(() => {
        const original = navigator.mediaDevices?.enumerateDevices?.bind(
          navigator.mediaDevices,
        );
        if (navigator.mediaDevices && original) {
          navigator.mediaDevices.enumerateDevices = async () =>
            (await original()).filter((d) => d.kind !== "videoinput");
        }
      });
    }

    await alice.goto("/");
    await alice.getByLabel("Your name").fill("Ann");
    await alice.getByRole("button", { name: "Create a room" }).click();
    await alice.waitForURL(/\/room\/[A-Z2-9]{6}/, { timeout: 20000 });
    const code = alice.url().split("/room/")[1].slice(0, 6);

    await bob.goto(`/room/${code}`);
    await bob.getByLabel("Your name").fill("Bo");
    await bob.getByRole("button", { name: "Enter room" }).click();
    await expect(alice.getByText("Bo").first()).toBeVisible({ timeout: 20000 });

    // The lobby explains why camera games are unavailable.
    await expect(alice.getByText(/Camera games are sitting this one out/)).toBeVisible({
      timeout: 20000,
    });

    // Custom mode, best of 1, so one round decides the match quickly.
    await alice.getByRole("button", { name: /Custom/ }).click();
    await alice.getByRole("button", { name: "Best of 1" }).click();

    await alice.getByRole("button", { name: "Ready up" }).click();
    await bob.getByRole("button", { name: "Ready up" }).click();

    // A game starts — and it is never the camera game.
    await expect(alice.getByText("Round 1 of 1")).toBeVisible({ timeout: 30000 });
    const header = await alice.locator("header").innerText();
    expect(header).not.toContain("Pose Perfect");

    await ctxA.close();
    await ctxB.close();
  });
});
