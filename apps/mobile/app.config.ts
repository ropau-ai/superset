import path from "node:path";
import { config } from "dotenv";
import type { ConfigContext } from "expo/config";

// Load .env file
config({
	path: path.resolve(__dirname, "../../.env"),
	override: true,
	quiet: true,
});

export default ({ config }: ConfigContext) => ({
	...config,
	name: "Superset",
	slug: "superset",
	version: "1.0.0",
	orientation: "portrait",
	icon: "./assets/icon.png",
	userInterfaceStyle: "dark",
	scheme: "superset",
	splash: {
		image: "./assets/splash-icon.png",
		resizeMode: "contain" as const,
		backgroundColor: "#09090b",
	},
	ios: {
		supportsTablet: true,
		bundleIdentifier: "sh.superset.mobile",
		infoPlist: {
			ITSAppUsesNonExemptEncryption: false,
		},
	},
	android: {
		adaptiveIcon: {
			foregroundImage: "./assets/adaptive-icon.png",
			backgroundColor: "#0B0B0F",
		},
		package: "sh.superset.mobile",
		predictiveBackGestureEnabled: false,
	},
	web: {
		favicon: "./assets/favicon.png",
		bundler: "metro",
	},
	plugins: [
		"expo-router",
		"expo-localization",
		"expo-notifications",
		[
			"expo-speech-recognition",
			{
				microphonePermission:
					"Allow Emilien to use the microphone to dictate your messages.",
				speechRecognitionPermission:
					"Allow Emilien to transcribe your voice into text.",
				androidSpeechServicePackages: [
					"com.google.android.googlequicksearchbox",
				],
			},
		],
	],
	extra: {
		router: {},
		eas: {
			projectId: "fa9332a8-896a-4d2a-be5b-d82469b46e5d",
		},
	},
	owner: "supserset-sh",
});
