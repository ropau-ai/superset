import Svg, { Circle, Rect } from "react-native-svg";
import { EMBER } from "@/lib/theme";

export interface EmilienLogoProps {
	/** Rendered square edge in px. */
	size?: number;
	/**
	 * When set, paints a dark rounded-square badge behind the mark (for splash /
	 * settings tiles). Omit for a transparent inline header mark.
	 */
	backgroundColor?: string;
	/** Override the accent (defaults to the Emilien ember). */
	color?: string;
}

/**
 * The Emilien / Ropau brand mark — an "orbital point": a warm-ember core
 * (Emilien, the orchestrator) with a single satellite riding its orbit (the
 * fleet it pilots). Deliberately minimal and one-accent, it mirrors the app
 * icon rasterized by `scripts/generate-icons.mjs` so the identity reads the same
 * from the springboard to the in-app header.
 */
export function EmilienLogo({
	size = 28,
	backgroundColor,
	color = EMBER,
}: EmilienLogoProps) {
	// Satellite sits on the orbit at the upper-right (−45°): (r·cos, −r·sin).
	const orbit = 13;
	const satX = 20 + orbit * Math.SQRT1_2;
	const satY = 20 - orbit * Math.SQRT1_2;

	return (
		<Svg width={size} height={size} viewBox="0 0 40 40" fill="none">
			{backgroundColor ? (
				<Rect
					x={0}
					y={0}
					width={40}
					height={40}
					rx={10}
					fill={backgroundColor}
				/>
			) : null}
			<Circle
				cx={20}
				cy={20}
				r={orbit}
				stroke={color}
				strokeOpacity={0.38}
				strokeWidth={2}
				fill="none"
			/>
			<Circle cx={20} cy={20} r={6.4} fill={color} />
			{backgroundColor ? (
				<Circle cx={satX} cy={satY} r={4.4} fill={backgroundColor} />
			) : null}
			<Circle cx={satX} cy={satY} r={3} fill={color} />
		</Svg>
	);
}
