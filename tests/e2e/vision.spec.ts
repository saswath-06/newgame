import { expect, test } from "@playwright/test";

/**
 * Vision smoke test. Chromium's fake webcam feeds a synthetic video, which
 * is enough to prove the whole pipeline wires up: camera acquisition,
 * MediaPipe WASM + model download, the detection loop, and the overlay.
 * Detection accuracy is covered by the unit tests, which feed real
 * landmark arrays into the pure algorithms.
 */
// launchOptions must be top-level — it forces a dedicated worker.
test.use({
  launchOptions: {
    args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"],
  },
  permissions: ["camera"],
});

test.describe("vision foundation", () => {
  test("dev inspector starts the camera and loads the pose model", async ({ page }) => {
    const failures: string[] = [];
    page.on("pageerror", (err) => failures.push(String(err)));

    await page.goto("/dev/vision");
    await expect(page.getByRole("heading", { name: /Vision/ })).toBeVisible();

    await page.getByRole("button", { name: "Start camera" }).click();

    // Model loading pulls WASM + weights from the CDN, so allow time.
    await expect(page.getByText(/^running/)).toBeVisible({ timeout: 90000 });

    // The video element is actually playing frames.
    const playing = await page.evaluate(() => {
      const video = document.querySelector("video");
      return Boolean(video && video.readyState >= 2 && video.videoWidth > 0);
    });
    expect(playing).toBe(true);

    // The pose panel renders alongside the feed.
    await expect(page.getByRole("button", { name: "Next pose" })).toBeVisible();

    // Switching to hand mode re-initializes without crashing.
    await page.getByRole("button", { name: "Hands" }).click();
    await expect(page.getByText(/No gesture|Open palm|Fist|Peace|Point/)).toBeVisible({
      timeout: 90000,
    });

    // Stopping releases the camera cleanly.
    await page.getByRole("button", { name: "Stop camera" }).click();
    await expect(page.getByText(/Start the camera to inspect/)).toBeVisible();

    expect(failures).toEqual([]);
  });
});
