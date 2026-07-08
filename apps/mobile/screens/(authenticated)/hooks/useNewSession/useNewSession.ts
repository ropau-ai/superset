import type { SelectV2Workspace } from "@superset/db/schema";
import { useLiveQuery } from "@tanstack/react-db";
import { compareDesc } from "date-fns";
import { randomUUID } from "expo-crypto";
import { useRouter } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import { Alert, useWindowDimensions } from "react-native";
import { apiClient } from "@/lib/trpc/client";
import { useCollections } from "@/screens/(authenticated)/providers/CollectionsProvider";

export interface NewSessionSheetProps {
	isPresented: boolean;
	onIsPresentedChange: (value: boolean) => void;
	workspaces: SelectV2Workspace[];
	onSelectWorkspace: (workspaceId: string) => void;
	isCreating: boolean;
	width: number;
}

/**
 * Shared "new session" handler: lists cloud workspaces, resolves the 1-vs-N
 * picker, creates a session via tRPC and navigates to the Live Session.
 */
export function useNewSession(): {
	open: () => void;
	sheetProps: NewSessionSheetProps;
} {
	const router = useRouter();
	const collections = useCollections();
	const { width } = useWindowDimensions();
	const [sheetOpen, setSheetOpen] = useState(false);
	const [isCreating, setIsCreating] = useState(false);

	const { data: workspaces } = useLiveQuery(
		(q) => q.from({ v2Workspaces: collections.v2Workspaces }),
		[collections],
	);

	const sortedWorkspaces = useMemo<SelectV2Workspace[]>(
		() =>
			[...(workspaces ?? [])].sort((a, b) =>
				compareDesc(a.updatedAt, b.updatedAt),
			),
		[workspaces],
	);

	const create = useCallback(
		async (workspaceId: string) => {
			if (isCreating) return;
			setIsCreating(true);
			const sessionId = randomUUID();
			try {
				await apiClient.chat.createSession.mutate({
					sessionId,
					v2WorkspaceId: workspaceId,
				});
				setSheetOpen(false);
				router.push(`/(authenticated)/(tabs)/(sessions)/${sessionId}`);
			} catch {
				Alert.alert("Couldn't create session", "Please try again.");
			} finally {
				setIsCreating(false);
			}
		},
		[isCreating, router],
	);

	const open = useCallback(() => {
		if (isCreating) return;
		if (sortedWorkspaces.length === 0) {
			Alert.alert(
				"No workspaces",
				"Create a workspace from the desktop app first.",
			);
			return;
		}
		if (sortedWorkspaces.length === 1) {
			void create(sortedWorkspaces[0].id);
			return;
		}
		setSheetOpen(true);
	}, [sortedWorkspaces, isCreating, create]);

	return {
		open,
		sheetProps: {
			isPresented: sheetOpen,
			onIsPresentedChange: setSheetOpen,
			workspaces: sortedWorkspaces,
			onSelectWorkspace: create,
			isCreating,
			width,
		},
	};
}
