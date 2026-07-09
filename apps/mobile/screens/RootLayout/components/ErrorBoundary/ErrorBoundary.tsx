import { Component, type ErrorInfo, type ReactNode } from "react";
import { View } from "react-native";
import { EmilienLogo } from "@/components/EmilienLogo";
import { Button } from "@/components/ui/button";
import { Text } from "@/components/ui/text";

interface ErrorBoundaryProps {
	children: ReactNode;
	/** Label for logs/crash reporting — e.g. "root" or a tab name. */
	scope?: string;
}

interface ErrorBoundaryState {
	error: Error | null;
}

/**
 * Branded error boundary. A render-time throw anywhere below it — a malformed
 * relay payload reaching a message renderer, say — is caught and shown as a calm,
 * on-brand recovery screen instead of white-screening the whole app. "Reload"
 * clears the error and re-mounts the subtree (the live queries re-hydrate), so a
 * transient bad state is one tap from recovery. Wrap the whole Stack for a global
 * net, and optionally individual tabs so one screen's failure is contained.
 */
export class ErrorBoundary extends Component<
	ErrorBoundaryProps,
	ErrorBoundaryState
> {
	state: ErrorBoundaryState = { error: null };

	static getDerivedStateFromError(error: Error): ErrorBoundaryState {
		return { error };
	}

	componentDidCatch(error: Error, info: ErrorInfo): void {
		// Never swallow silently — surface in dev + crash reporting.
		const label = this.props.scope ? `:${this.props.scope}` : "";
		console.error(`[error-boundary${label}]`, error, info.componentStack);
	}

	reset = (): void => {
		this.setState({ error: null });
	};

	render(): ReactNode {
		if (this.state.error) {
			return (
				<View className="flex-1 items-center justify-center gap-5 bg-background px-8">
					<EmilienLogo size={48} />
					<View className="items-center gap-2">
						<Text className="text-center font-semibold text-lg">
							Something went wrong
						</Text>
						<Text className="max-w-xs text-center text-muted-foreground text-sm">
							This screen hit an unexpected error. Reload to get back to the
							cockpit.
						</Text>
					</View>
					<Button onPress={this.reset} variant="outline">
						<Text>Reload</Text>
					</Button>
				</View>
			);
		}
		return this.props.children;
	}
}
