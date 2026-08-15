window.__ModuleLoader__.load({
	id: "dsh-view-image",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });

		let react = require("react");

		exports.name = "view-image";
		exports.inject = ["slots"];

		const API = "/plugins/dsh-view-image/api/settings";

		function Field(props) {
			return react.createElement("div", { style: { display: "flex", alignItems: "center", gap: 10, padding: "6px 0" } },
				react.createElement("div", { style: { fontSize: 13, width: 130, flex: "none" } }, props.label),
				props.children,
			);
		}

		function SettingsForm() {
			const [settings, setSettings] = react.useState(null);
			const [models, setModels] = react.useState({ providers: [], models: [] });
			react.useEffect(() => {
				let alive = true;
				fetch(API).then((r) => r.json()).then((j) => { if (alive) setSettings(j.settings); }).catch(() => {});
				fetch("/plugins/dsh-view-image/api/models").then((r) => r.json()).then((j) => { if (alive) setModels(j); }).catch(() => {});
				return () => { alive = false; };
			}, []);
			const update = (patch) => {
				setSettings((prev) => ({ ...prev, ...patch }));
				fetch(API, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ patch }) }).catch(() => {});
			};
			if (!settings) return react.createElement("div", { style: { fontSize: 13, opacity: 0.6 } }, "加载中…");
			return react.createElement("div", { style: { maxWidth: 560, padding: "4px 0 16px" } },
				react.createElement("datalist", { id: "provider-list" }, models.providers.map((n) => react.createElement("option", { key: n, value: n }))),
				react.createElement("datalist", { id: "model-list" }, models.models.map((n) => react.createElement("option", { key: n, value: n }))),
				react.createElement(Field, { label: "启用" },
					react.createElement("input", { type: "checkbox", checked: settings["启用"], onChange: (e) => update({ "启用": e.target.checked }), style: { width: 16, height: 16 } }),
				),
				react.createElement(Field, { label: "视觉模型 provider" },
					react.createElement("input", { type: "text", list: "provider-list", value: settings["视觉模型 provider"] ?? "", onChange: (e) => update({ "视觉模型 provider": e.target.value }), style: { flex: 1, maxWidth: 280 } }),
				),
				react.createElement(Field, { label: "视觉模型名" },
					react.createElement("input", { type: "text", list: "model-list", value: settings["视觉模型名"] ?? "", onChange: (e) => update({ "视觉模型名": e.target.value }), style: { flex: 1, maxWidth: 280 } }),
				),
			);
		}

		exports.apply = function (ctx) {
			ctx.slots.inject("settings.section", () => ctx.slots.register({
				name: "settings.section",
				id: "dsh-view-image",
				order: 54,
				label: "看图",
				inject: () => ({}),
			}, SettingsForm));
		};

		return module.exports;
	},
});
