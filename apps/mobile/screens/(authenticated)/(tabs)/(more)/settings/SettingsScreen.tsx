import * as Application from "expo-application";
import Constants from "expo-constants";
import { useRouter } from "expo-router";
import {
	ArrowLeftRight,
	Bell,
	FolderGit2,
	Info,
	LogOut,
	MessageSquare,
	Moon,
	Palette,
	User,
} from "lucide-react-native";
import { useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { EmilienLogo } from "@/components/EmilienLogo";
import { Switch } from "@/components/ui/switch";
import { Text } from "@/components/ui/text";
import { useSignOut } from "@/hooks/useSignOut";
import { useSession } from "@/lib/auth/client";
import {
	ensureAgentNotificationPermission,
	type NotificationScope,
	useAgentNotificationsEnabled,
	useNotificationScope,
} from "@/lib/notifications";
import { EMBER } from "@/lib/theme";
import { cn } from "@/lib/utils";
import { useEmilienSession } from "@/screens/(authenticated)/(tabs)/(home)/cockpit/hooks/useEmilienSession";
import { useOrganizations } from "@/screens/(authenticated)/hooks/useOrganizations";
import { OrganizationAvatar } from "../../(home)/workspaces/components/OrganizationSwitcherSheet/components/OrganizationAvatar";
import { SettingsRow } from "./components/SettingsRow";
import { SettingsSection } from "./components/SettingsSection";

const SCOPE_OPTIONS: { value: NotificationScope; label: string }[] = [
	{ value: "emilien", label: "Emilien only" },
	{ value: "fleet", label: "Whole fleet" },
];

function ScopeSegmented({
	scope,
	onChange,
}: {
	scope: NotificationScope;
	onChange: (scope: NotificationScope) => void;
}) {
	return (
		<View className="flex-row gap-1 rounded-lg bg-muted p-0.5">
			{SCOPE_OPTIONS.map((option) => {
				const active = option.value === scope;
				return (
					<Pressable
						className={cn(
							"flex-1 items-center rounded-md py-1.5",
							active && "bg-background",
						)}
						key={option.value}
						onPress={() => onChange(option.value)}
					>
						<Text
							className={cn(
								"text-sm",
								active
									? "font-medium text-foreground"
									: "text-muted-foreground",
							)}
						>
							{option.label}
						</Text>
					</Pressable>
				);
			})}
		</View>
	);
}

export function SettingsScreen() {
	const router = useRouter();
	const { data: authData } = useSession();
	const { signOut } = useSignOut();
	const {
		organizations,
		activeOrganization,
		activeOrganizationId,
		switchOrganization,
	} = useOrganizations();
	const { enabled, setEnabled } = useAgentNotificationsEnabled();
	const { scope, setScope } = useNotificationScope();
	const emilien = useEmilienSession();
	const [permissionBlocked, setPermissionBlocked] = useState(false);

	const email = authData?.user?.email ?? "Signed in";
	const otherOrgs = organizations.filter(
		(org) => org.id !== activeOrganizationId,
	);
	const projectLabel = emilien.project
		? `${emilien.project.name} / ${emilien.workspace?.branch ?? "main"}`
		: "Zuno-Emilien / main";
	const version = Constants.expoConfig?.version ?? "1.0.0";
	const build = Application.nativeBuildVersion ?? null;

	const handleToggleNotifications = async (value: boolean) => {
		await setEnabled(value);
		if (value) {
			setPermissionBlocked(!(await ensureAgentNotificationPermission()));
		} else {
			setPermissionBlocked(false);
		}
	};

	const openEmilienSession = () => {
		if (emilien.session && emilien.workspace) {
			router.push(
				`/(authenticated)/workspace/${emilien.workspace.id}/chat/${emilien.session.id}`,
			);
		}
	};

	return (
		<ScrollView
			className="flex-1 bg-background"
			contentContainerStyle={{ padding: 20, paddingBottom: 48, gap: 24 }}
			contentInsetAdjustmentBehavior="automatic"
		>
			<SettingsSection title="Account">
				<SettingsRow icon={User} label={email} sublabel="Signed in" />
				<SettingsRow
					label={activeOrganization?.name ?? "Organization"}
					leading={
						<OrganizationAvatar
							logo={activeOrganization?.logo}
							name={activeOrganization?.name}
							size={32}
						/>
					}
					sublabel="Active organization"
				/>
				{otherOrgs.map((org) => (
					<SettingsRow
						chevron
						icon={ArrowLeftRight}
						key={org.id}
						label={`Switch to ${org.name}`}
						onPress={() => switchOrganization(org.id)}
					/>
				))}
				<SettingsRow
					destructive
					icon={LogOut}
					label="Log out"
					onPress={signOut}
				/>
			</SettingsSection>

			<SettingsSection
				footer="Emilien is designed for the dark. Light & system themes are coming."
				title="Appearance"
			>
				<SettingsRow
					icon={Moon}
					label="Theme"
					right={<Text className="text-muted-foreground">Dark</Text>}
				/>
				<SettingsRow
					icon={Palette}
					label="Accent"
					right={
						<View className="flex-row items-center gap-2">
							<View
								className="size-4 rounded-full"
								style={{ backgroundColor: EMBER }}
							/>
							<Text className="text-muted-foreground">Ember</Text>
						</View>
					}
				/>
			</SettingsSection>

			<SettingsSection
				footer="Real push delivery is pending Apple approval — local alerts work today."
				title="Notifications"
			>
				<SettingsRow
					icon={Bell}
					label="Agent notifications"
					right={
						<Switch
							checked={enabled}
							onCheckedChange={handleToggleNotifications}
						/>
					}
					sublabel="A heads-up when an agent needs approval or finishes."
				/>
				{enabled ? (
					<View className="gap-2 px-4 py-3">
						<Text className="text-muted-foreground text-sm">Granularity</Text>
						<ScopeSegmented onChange={setScope} scope={scope} />
					</View>
				) : null}
				{enabled && permissionBlocked ? (
					<View className="px-4 py-3">
						<Text className="text-muted-foreground text-sm">
							Allow notifications for Superset in system settings to receive
							these.
						</Text>
					</View>
				) : null}
			</SettingsSection>

			<SettingsSection
				footer="Emilien orchestrates the fleet from the Zuno-Emilien main workspace."
				title="Emilien"
			>
				<SettingsRow
					label="Emilien"
					leading={
						<View
							className="size-9 items-center justify-center rounded-xl border"
							style={{
								borderColor: "rgba(240,101,58,0.4)",
								backgroundColor: "rgba(240,101,58,0.1)",
							}}
						>
							<EmilienLogo size={22} />
						</View>
					}
					sublabel="Orchestrator · runs 24/7"
				/>
				<SettingsRow
					icon={FolderGit2}
					label="Project"
					right={<Text className="text-muted-foreground">{projectLabel}</Text>}
				/>
				<SettingsRow
					chevron={!!emilien.session}
					icon={MessageSquare}
					label="Live session"
					onPress={emilien.session ? openEmilienSession : undefined}
					right={
						emilien.session ? (
							<Text className="text-muted-foreground">Open</Text>
						) : (
							<Text className="text-muted-foreground">None</Text>
						)
					}
				/>
			</SettingsSection>

			<SettingsSection title="About">
				<SettingsRow
					icon={Info}
					label="Version"
					right={
						<Text className="text-muted-foreground">
							{version}
							{build ? ` (${build})` : ""}
						</Text>
					}
				/>
				<SettingsRow
					label="Superset · Emilien cockpit"
					leading={<EmilienLogo size={20} />}
					right={<Text className="text-muted-foreground">Ropau</Text>}
				/>
			</SettingsSection>
		</ScrollView>
	);
}
