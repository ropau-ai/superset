import type { LucideIcon } from "lucide-react-native";
import { ChevronRight } from "lucide-react-native";
import type { ReactNode } from "react";
import { Pressable, View } from "react-native";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { cn } from "@/lib/utils";

export interface SettingsRowProps {
	icon?: LucideIcon;
	/** Custom leading node (e.g. a logo) used instead of `icon`. */
	leading?: ReactNode;
	label: string;
	sublabel?: string;
	/** Trailing content (value text, switch, swatch…). */
	right?: ReactNode;
	onPress?: () => void;
	chevron?: boolean;
	destructive?: boolean;
	disabled?: boolean;
}

/**
 * One row inside a settings group: leading icon/logo, label + optional
 * sublabel, and trailing content. Becomes pressable (with an active tint) when
 * `onPress` is set. Purely presentational.
 */
export function SettingsRow({
	icon,
	leading,
	label,
	sublabel,
	right,
	onPress,
	chevron,
	destructive,
	disabled,
}: SettingsRowProps) {
	const body = (
		<View className="flex-row items-center gap-3 px-4 py-3">
			{leading ??
				(icon ? (
					<Icon
						as={icon}
						className={cn(
							"size-5",
							destructive ? "text-destructive" : "text-muted-foreground",
						)}
						strokeWidth={1.75}
					/>
				) : null)}
			<View className="flex-1 gap-0.5">
				<Text
					className={cn("text-base", destructive && "text-destructive")}
					numberOfLines={1}
				>
					{label}
				</Text>
				{sublabel ? (
					<Text className="text-muted-foreground text-sm" numberOfLines={2}>
						{sublabel}
					</Text>
				) : null}
			</View>
			{right}
			{chevron ? (
				<Icon
					as={ChevronRight}
					className="size-5 text-muted-foreground"
					strokeWidth={2}
				/>
			) : null}
		</View>
	);

	if (!onPress) return body;
	return (
		<Pressable
			className="active:bg-accent"
			disabled={disabled}
			onPress={onPress}
		>
			{body}
		</Pressable>
	);
}
