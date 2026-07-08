import { useCallback, useEffect, useRef, useState } from "react";

type SpeechModule = typeof import("expo-speech");

/**
 * `expo-speech` resolves its native module at import time, which throws on a dev
 * client that wasn't rebuilt with the module compiled in. We require it
 * defensively so a missing native module degrades to `available: false` instead
 * of crashing the chat on mount. Present in Expo Go and any rebuilt dev client.
 */
let Speech: SpeechModule | null = null;
try {
	Speech = require("expo-speech") as SpeechModule;
} catch {
	// Native TTS module isn't in this build — a dev-client rebuild adds it.
	Speech = null;
}

/** Emilien speaks French by default. */
const DEFAULT_LANGUAGE = "fr-FR";

export interface UseTextToSpeechResult {
	/** True when the native TTS engine is present (Expo Go or a rebuilt client). */
	available: boolean;
	/** The id currently being spoken, or null — lets a list highlight one row. */
	speakingId: string | null;
	/** Speak `text`, tagged with `id` so a caller can reflect per-row state. */
	speak: (id: string, text: string) => void;
	/** Interrupt any current speech. */
	stop: () => void;
}

/**
 * Text-to-speech for Emilien's replies. One utterance at a time, tagged by a
 * caller-supplied id (typically the message id) so the UI can show which row is
 * speaking and toggle it off. French voice by default; degrades to a no-op with
 * `available: false` when the native engine isn't in the build.
 */
export function useTextToSpeech(): UseTextToSpeechResult {
	const [speakingId, setSpeakingId] = useState<string | null>(null);
	const currentRef = useRef<string | null>(null);

	const clear = useCallback((id: string) => {
		if (currentRef.current === id) {
			currentRef.current = null;
			setSpeakingId(null);
		}
	}, []);

	const stop = useCallback(() => {
		currentRef.current = null;
		setSpeakingId(null);
		try {
			void Speech?.stop();
		} catch {
			// Nothing to stop.
		}
	}, []);

	const speak = useCallback(
		(id: string, text: string) => {
			const content = text.trim();
			if (!Speech || !content) return;
			// Interrupt whatever is playing so ids never overlap.
			try {
				void Speech.stop();
			} catch {
				// No active utterance to interrupt.
			}
			currentRef.current = id;
			setSpeakingId(id);
			try {
				Speech.speak(content, {
					language: DEFAULT_LANGUAGE,
					onDone: () => clear(id),
					onStopped: () => clear(id),
					onError: () => clear(id),
				});
			} catch {
				clear(id);
			}
		},
		[clear],
	);

	// Stop speaking when the screen goes away.
	useEffect(
		() => () => {
			try {
				void Speech?.stop();
			} catch {
				// Nothing to stop on unmount.
			}
		},
		[],
	);

	return { available: Speech !== null, speakingId, speak, stop };
}
