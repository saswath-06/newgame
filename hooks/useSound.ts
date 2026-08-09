"use client";

import { useCallback, useSyncExternalStore } from "react";
import { soundManager, type SoundName } from "@/lib/sound";

export function useSound() {
  const settings = useSyncExternalStore(
    (cb) => soundManager.subscribe(cb),
    () => `${soundManager.muted}:${soundManager.volume}`,
    () => "false:0.6",
  );
  const [mutedStr, volumeStr] = settings.split(":");

  const play = useCallback((name: SoundName) => soundManager.play(name), []);
  const toggleMute = useCallback(
    () => soundManager.setMuted(!soundManager.muted),
    [],
  );
  const setVolume = useCallback((v: number) => soundManager.setVolume(v), []);

  return {
    play,
    muted: mutedStr === "true",
    volume: Number(volumeStr),
    toggleMute,
    setVolume,
  };
}
