import { theme, setTheme } from "../../stores/app";
import { Sun, Moon } from "lucide-solid";

export default function TopBar() {
	function toggleTheme() {
		const next = theme() === "dark" ? "light" : "dark";
		setTheme(next);
		document.documentElement.dataset.theme = next;
	}

	return (
		<header class="app-topbar">
			<div class="toolbar-spacer" />

			<button class="topbar-btn" onClick={toggleTheme} title="Toggle theme">
				{theme() === "dark" ? <Sun size={16} /> : <Moon size={16} />}
			</button>
		</header>
	);
}
