import type { ReactNode } from "react";
import { createContext, useContext, useMemo } from "react";
import { BrandedLoader } from "@/components/BrandedLoader";
import { useSession } from "@/lib/auth/client";
import { getCollections } from "@/lib/collections/collections";

type Collections = ReturnType<typeof getCollections>;
const CollectionsContext = createContext<Collections | null>(null);

export function CollectionsProvider({ children }: { children: ReactNode }) {
	const { data: session } = useSession();
	const activeOrganizationId = session?.session?.activeOrganizationId;

	const collections = useMemo(() => {
		if (!activeOrganizationId) return null;
		return getCollections(activeOrganizationId);
	}, [activeOrganizationId]);

	// The active organization rides in on the session and can lag a beat behind
	// auth. Hold on a branded loader rather than rendering nothing (a blank dark
	// screen) until it resolves.
	if (!activeOrganizationId) {
		return <BrandedLoader label="Loading your workspace…" />;
	}

	return (
		<CollectionsContext.Provider value={collections}>
			{children}
		</CollectionsContext.Provider>
	);
}

export function useCollections(): Collections {
	const context = useContext(CollectionsContext);
	if (context === undefined) {
		throw new Error("useCollections must be used within CollectionsProvider");
	}
	if (!context) {
		throw new Error(
			"Collections not available - user must be signed in with an active organization",
		);
	}
	return context;
}
