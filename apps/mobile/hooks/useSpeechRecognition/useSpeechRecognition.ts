import type {
	ExpoSpeechRecognitionErrorEvent,
	ExpoSpeechRecognitionResultEvent,
} from "expo-speech-recognition";
import { useCallback, useEffect, useRef, useState } from "react";

type SpeechRecognitionModule = typeof import("expo-speech-recognition");

/**
 * Like `expo-speech`, this resolves its native module at import time and throws
 * on a dev client that wasn't rebuilt with the module compiled in. Requiring it
 * defensively lets dictation degrade to `available: false` (the mic button stays
 * inert with a hint) instead of crashing the chat. STT genuinely needs a native
 * dev-client rebuild (`expo run:ios`) — it is not in Expo Go.
 */
let SpeechRecognition: SpeechRecognitionModule | null = null;
try {
	SpeechRecognition =
		require("expo-speech-recognition") as SpeechRecognitionModule;
} catch {
	// Native STT module isn't in this build — a dev-client rebuild adds it.
	SpeechRecognition = null;
}

const nativeModule = SpeechRecognition?.ExpoSpeechRecognitionModule ?? null;

/** Emilien listens in French by default. */
const DEFAULT_LOCALE = "fr-FR";

export type SpeechRecognitionStatus =
	| "unavailable"
	| "denied"
	| "idle"
	| "listening";

export interface UseSpeechRecognitionArgs {
	/** Running transcript (interim + final) as the user speaks. */
	onTranscript: (text: string) => void;
	/** Fired once with the final transcript when a phrase completes. */
	onFinal?: (text: string) => void;
	locale?: string;
}

export interface UseSpeechRecognitionResult {
	status: SpeechRecognitionStatus;
	listening: boolean;
	available: boolean;
	/** Request permission if needed, then start. Resolves false if it can't. */
	start: () => Promise<boolean>;
	stop: () => void;
}

/**
 * On-device dictation for the composer. Requests mic + speech permission on
 * first use, streams interim results to `onTranscript`, and reflects a
 * four-state status (`unavailable` / `denied` / `idle` / `listening`) so the mic
 * button can render honestly. French locale by default.
 */
export function useSpeechRecognition({
	onTranscript,
	onFinal,
	locale = DEFAULT_LOCALE,
}: UseSpeechRecognitionArgs): UseSpeechRecognitionResult {
	const [status, setStatus] = useState<SpeechRecognitionStatus>(
		nativeModule ? "idle" : "unavailable",
	);
	const onTranscriptRef = useRef(onTranscript);
	const onFinalRef = useRef(onFinal);
	onTranscriptRef.current = onTranscript;
	onFinalRef.current = onFinal;

	useEffect(() => {
		if (!nativeModule) return;
		const subscriptions = [
			nativeModule.addListener("start", () => setStatus("listening")),
			nativeModule.addListener("end", () =>
				setStatus((prev) => (prev === "denied" ? prev : "idle")),
			),
			nativeModule.addListener(
				"result",
				(event: ExpoSpeechRecognitionResultEvent) => {
					const transcript = event.results?.[0]?.transcript ?? "";
					if (!transcript) return;
					onTranscriptRef.current(transcript);
					if (event.isFinal) onFinalRef.current?.(transcript);
				},
			),
			nativeModule.addListener(
				"error",
				(event: ExpoSpeechRecognitionErrorEvent) => {
					setStatus(
						event.error === "not-allowed" ||
							event.error === "service-not-allowed"
							? "denied"
							: "idle",
					);
				},
			),
		];
		return () => {
			for (const subscription of subscriptions) subscription.remove();
		};
	}, []);

	const start = useCallback(async (): Promise<boolean> => {
		if (!nativeModule) {
			setStatus("unavailable");
			return false;
		}
		try {
			const permission = await nativeModule.requestPermissionsAsync();
			if (!permission.granted) {
				setStatus("denied");
				return false;
			}
			nativeModule.start({
				lang: locale,
				interimResults: true,
				continuous: false,
			});
			setStatus("listening");
			return true;
		} catch {
			setStatus("idle");
			return false;
		}
	}, [locale]);

	const stop = useCallback(() => {
		if (!nativeModule) return;
		try {
			nativeModule.stop();
		} catch {
			// Recognition wasn't running.
		}
	}, []);

	// Abort any in-flight recognition when the screen goes away.
	useEffect(
		() => () => {
			if (!nativeModule) return;
			try {
				nativeModule.abort();
			} catch {
				// Nothing in flight on unmount.
			}
		},
		[],
	);

	return {
		status,
		listening: status === "listening",
		available: nativeModule !== null,
		start,
		stop,
	};
}
