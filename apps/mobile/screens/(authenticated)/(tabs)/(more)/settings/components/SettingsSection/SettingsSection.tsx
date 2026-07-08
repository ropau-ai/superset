import { Children, Fragment, isValidElement, type ReactNode } from "react";
import { View } from "react-native";
import { Separator } from "@/components/ui/separator";
import { Text } from "@/components/ui/text";

export interface SettingsSectionProps {
	title?: string;
	/** Small caption under the group. */
	footer?: string;
	children: ReactNode;
}

/**
 * A titled settings group: an uppercase label over a bordered card whose direct
 * children are auto-separated by hairlines. Matches the app's list idiom so
 * every settings surface reads consistently.
 */
export function SettingsSection({
	title,
	footer,
	children,
}: SettingsSectionProps) {
	const rows = Children.toArray(children).filter(isValidElement);
	return (
		<View className="gap-2">
			{title ? (
				<Text className="px-2 text-muted-foreground text-xs font-medium uppercase tracking-wide">
					{title}
				</Text>
			) : null}
			<View className="overflow-hidden rounded-2xl border border-border bg-card">
				{rows.map((row, index) => (
					<Fragment key={row.key ?? `settings-row-${index}`}>
						{index > 0 ? <Separator /> : null}
						{row}
					</Fragment>
				))}
			</View>
			{footer ? (
				<Text className="px-2 text-muted-foreground text-xs">{footer}</Text>
			) : null}
		</View>
	);
}
