import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
	EnterEnabledAlertDialogContent,
} from "@superset/ui/alert-dialog";
import { Button } from "@superset/ui/button";

interface ClosePaneConfirmDialogProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	/** "pane" closes a single pane, "tab" closes a whole group of panes. */
	scope: "pane" | "tab";
	onConfirm: () => void;
}

/**
 * Confirmation shown before closing a pane / group that still has a live
 * process (an agent mid-run or an active workspace-run command), so a running
 * agent is not stopped or detached by a stray click.
 */
export function ClosePaneConfirmDialog({
	open,
	onOpenChange,
	scope,
	onConfirm,
}: ClosePaneConfirmDialogProps) {
	const title =
		scope === "tab"
			? "Close group with running work?"
			: "Close pane with running work?";
	const description =
		scope === "tab"
			? "This group still has a running agent or process. Closing it will stop or detach that work."
			: "This pane still has a running agent or process. Closing it will stop or detach that work.";

	return (
		<AlertDialog open={open} onOpenChange={onOpenChange}>
			<EnterEnabledAlertDialogContent className="max-w-[360px] gap-0 p-0">
				<AlertDialogHeader className="px-4 pt-4 pb-2">
					<AlertDialogTitle className="font-medium">{title}</AlertDialogTitle>
					<AlertDialogDescription>{description}</AlertDialogDescription>
				</AlertDialogHeader>
				<AlertDialogFooter className="px-4 pb-4 pt-2 flex-row justify-end gap-2">
					<Button
						variant="ghost"
						size="sm"
						className="h-7 px-3 text-xs"
						onClick={() => onOpenChange(false)}
					>
						Cancel
					</Button>
					<AlertDialogAction
						variant="destructive"
						size="sm"
						className="h-7 px-3 text-xs"
						onClick={onConfirm}
					>
						Close
					</AlertDialogAction>
				</AlertDialogFooter>
			</EnterEnabledAlertDialogContent>
		</AlertDialog>
	);
}
