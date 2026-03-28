/* @refresh reload */
import { render } from "solid-js/web";
import { Router, Route } from "@solidjs/router";
import App from "./App";
import Workspace from "./pages/Workspace";
import Logbooks from "./pages/Logbooks";
import Profiles from "./pages/Profiles";
import Templates from "./pages/Templates";
import Settings from "./pages/Settings";

render(
	() => (
		<Router root={App}>
			<Route path="/" component={Workspace} />
			<Route path="/logbooks" component={Logbooks} />
			<Route path="/profiles" component={Profiles} />
			<Route path="/templates" component={Templates} />
			<Route path="/settings" component={Settings} />
		</Router>
	),
	document.getElementById("root") as HTMLElement,
);
