import { type ParentProps, Show, onMount, onCleanup } from "solid-js";

interface ModalProps extends ParentProps {
	open: boolean;
	onClose: () => void;
	title: string;
}

export default function Modal(props: ModalProps) {
	function onKeyDown(e: KeyboardEvent) {
		if (e.key === "Escape") props.onClose();
	}

	onMount(() => document.addEventListener("keydown", onKeyDown));
	onCleanup(() => document.removeEventListener("keydown", onKeyDown));

	return (
		<Show when={props.open}>
			<div
				class="modal-overlay"
				onClick={(e) => {
					if (e.target === e.currentTarget) props.onClose();
				}}
			>
				<div class="modal">
					<div class="modal-header">
						<h2>{props.title}</h2>
						<button class="btn-icon" onClick={props.onClose}>
							✕
						</button>
					</div>
					{props.children}
				</div>
			</div>
		</Show>
	);
}
