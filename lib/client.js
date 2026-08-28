window.__ModuleLoader__.load({
	id: "@wwskills/dsh-agent-evolve",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });

		let react = require("react");
		let react_jsx_runtime = require("react/jsx-runtime");
		var j = react_jsx_runtime.jsx, js = react_jsx_runtime.jsxs;
		let slots = require("@deepseek-ai/dsh-client-ui-slots");

		const NS = "agent-evolve";

		// ─── i18n ───────────────────────────────────────────────────────────────
		const zh = {
			tab: "Agent Evolve",
			title: "Agent Evolve",
			subtitle: "从失败中学习，让 Agent 越来越懂你",
			// Tabs
			tabLessons: "教训",
			tabRules: "规则",
			tabMemories: "记忆",
			tabPersona: "画像",
			// Header
			configBtn: "配置",
			switchOn: "ON",
			switchOff: "OFF",
			// Advanced config
			advancedConfig: "高级配置",
			batchSize: "学习批次大小",
			correctionSignals: "纠正信号词",
			embedding: "Embedding",
			embeddingAuto: "自动探测",
			embeddingNone: "不使用",
			embeddingCustom: "自定义",
			embeddingStatus: "Embedding 状态",
			embeddingEnabled: "已启用",
			embeddingKeyword: "关键词模式",
			modelSelect: "模型选择",
			modelFollowCurrent: "跟随当前模型",
			modelCustom: "指定模型",
			personaFreq: "画像更新频率",
			personaFreqSessions: "每 {n} 次会话",
			personaFreqDays: "每 {n} 天",
			ruleInjectLimit: "规则注入上限",
			ruleInjectLimitUnit: "token",
			promoteThreshold: "提炼阈值",
			promoteThresholdUnit: "条",
			// Correction trigger types
			triggerToolError: "工具失败",
			triggerUserCorrection: "用户纠正",
			triggerSelfFix: "Agent 自修正",
			// Correction card
			rootCause: "根因",
			correctAction: "正确做法",
			rule: "防护规则（草稿）",
			context: "上下文",
			extractRule: "提炼为规则",
			ignore: "忽略",
			collapse: "收起",
			// Filter
			filterAll: "全部",
			filterPending: "待处理",
			filterPromoted: "已提炼",
			filterIgnored: "已忽略",
			// Rules tab
			rulePending: "待审",
			ruleApproved: "已批准",
			ruleSource: "来源",
			ruleFrom: "教训 #",
			approve: "批准",
			edit: "编辑",
			reject: "拒绝",
			graduable: "可晋升",
			graduated: "已晋升",
			// Stats bar
			lineLessons: "教训线",
			lineRules: "规则线",
			lineMemories: "记忆线",
			statsCaptured: "纠正",
			statsExtracted: "提炼",
			statsProposed: "提议",
			statsApproved: "已批准",
			statsExtractions: "抽取",
			statsPersonaUpdated: "画像更新",
			statsDaysAgo: "天前",
			statsNever: "从未",
			statsPaused: "已暂停",
			// Empty states
			emptyLessons: "还没有捕捉到教训，Agent 表现不错 👍",
			emptyRules: "暂无待审规则",
			emptyMemories: "还没有积累记忆，开始新对话让 Agent 认识你",
			emptyPersona: "画像正在生成中...",
			// Load / error states
			loading: "加载中...",
			loadFailed: "加载失败",
			retry: "重试",
			// Misc
			badge: "badge",
			closed: "（已关闭）",
			days: "天",
		};

		const en = {
			tab: "Agent Evolve",
			title: "Agent Evolve",
			subtitle: "Learn from failures, make Agent smarter",
			tabLessons: "Lessons",
			tabRules: "Rules",
			tabMemories: "Memories",
			tabPersona: "Persona",
			configBtn: "Config",
			switchOn: "ON",
			switchOff: "OFF",
			advancedConfig: "Advanced Config",
			batchSize: "Learning batch size",
			correctionSignals: "Correction signals",
			embedding: "Embedding",
			embeddingAuto: "Auto-detect",
			embeddingNone: "Disabled",
			embeddingCustom: "Custom",
			embeddingStatus: "Embedding status",
			embeddingEnabled: "enabled",
			embeddingKeyword: "keyword mode",
			modelSelect: "Model",
			modelFollowCurrent: "Follow current model",
			modelCustom: "Custom model",
			personaFreq: "Persona update frequency",
			personaFreqSessions: "Every {n} sessions",
			personaFreqDays: "Every {n} days",
			ruleInjectLimit: "Rule injection limit",
			ruleInjectLimitUnit: "token",
			promoteThreshold: "Extraction threshold",
			promoteThresholdUnit: "items",
			triggerToolError: "Tool Error",
			triggerUserCorrection: "User Correction",
			triggerSelfFix: "Agent Self-Fix",
			rootCause: "Root Cause",
			correctAction: "Correct Action",
			rule: "Guard Rule (draft)",
			context: "Context",
			extractRule: "Extract Rule",
			ignore: "Ignore",
			collapse: "Collapse",
			filterAll: "All",
			filterPending: "Pending",
			filterPromoted: "Extracted",
			filterIgnored: "Ignored",
			rulePending: "Pending Review",
			ruleApproved: "Approved",
			ruleSource: "Source",
			ruleFrom: "Lesson #",
			approve: "Approve",
			edit: "Edit",
			reject: "Reject",
			graduable: "Can Graduate",
			graduated: "Graduated",
			lineLessons: "Lessons",
			lineRules: "Rules",
			lineMemories: "Memories",
			statsCaptured: "Captured",
			statsExtracted: "Extracted",
			statsProposed: "Proposed",
			statsApproved: "Approved",
			statsExtractions: "Extractions",
			statsPersonaUpdated: "Persona updated",
			statsDaysAgo: "days ago",
			statsNever: "never",
			statsPaused: "Paused",
			emptyLessons: "No lessons captured yet — Agent is doing great 👍",
			emptyRules: "No rules pending review",
			emptyMemories: "No memories yet — start a conversation to let Agent learn about you",
			emptyPersona: "Persona is being generated...",
			loading: "Loading...",
			loadFailed: "Load failed",
			retry: "Retry",
			badge: "badge",
			closed: "(closed)",
			days: "days",
		};

		// ─── Styles ────────────────────────────────────────────────────────────
		const cardStyle = {
			background: "var(--dsw-alias-bg-layer-2)",
			border: "1px solid var(--dsw-alias-border-l2)",
			borderRadius: "12px",
		};

		const headerStyle = {
			fontSize: "16px",
			fontWeight: 600,
			color: "var(--dsw-alias-label-primary)",
			margin: "0",
		};

		const dividerStyle = {
			height: "1px",
			background: "var(--dsw-alias-border-l2)",
			margin: "12px 0",
		};

		const labelStyle = {
			fontSize: "14px",
			fontWeight: 500,
			color: "var(--dsw-alias-label-primary)",
			marginBottom: "4px",
		};

		const descStyle = {
			fontSize: "12px",
			color: "var(--dsw-alias-label-tertiary)",
			marginTop: "4px",
		};

		const inputStyle = {
			height: "36px",
			padding: "0 12px",
			background: "var(--dsw-alias-bg-input)",
			color: "var(--dsw-alias-label-primary)",
			border: "1px solid var(--dsw-alias-border-l2)",
			borderRadius: "8px",
			fontSize: "14px",
			outline: "none",
			width: "100%",
			boxSizing: "border-box",
		};

		const selectStyle = {
			height: "36px",
			padding: "0 12px",
			background: "var(--dsw-alias-bg-input)",
			color: "var(--dsw-alias-label-primary)",
			border: "1px solid var(--dsw-alias-border-l2)",
			borderRadius: "8px",
			fontSize: "14px",
			outline: "none",
			width: "100%",
			boxSizing: "border-box",
		};

		const btnPrimary = {
			height: "32px",
			padding: "0 14px",
			background: "var(--dsw-alias-button-primary-fill)",
			color: "var(--dsw-alias-label-primary-foreground)",
			border: "none",
			borderRadius: "8px",
			fontSize: "13px",
			cursor: "pointer",
			fontWeight: 500,
		};

		const btnOutline = {
			height: "32px",
			padding: "0 14px",
			background: "transparent",
			color: "var(--dsw-alias-label-secondary)",
			border: "1px solid var(--dsw-alias-border-l2)",
			borderRadius: "8px",
			fontSize: "13px",
			cursor: "pointer",
		};

		const btnDanger = {
			height: "32px",
			padding: "0 14px",
			background: "transparent",
			color: "var(--dsw-alias-label-error)",
			border: "1px solid " + "var(--dsw-alias-label-error)",
			borderRadius: "8px",
			fontSize: "13px",
			cursor: "pointer",
		};

		const btnPill = {
			border: "1px solid var(--dsw-alias-border-l2)",
			background: "transparent",
			color: "var(--dsw-alias-label-primary)",
			borderRadius: "12px",
			padding: "1px 10px",
			cursor: "pointer",
			fontSize: "12px",
			whiteSpace: "nowrap",
			height: "22px",
			lineHeight: "20px",
		};

		const tabStyle = {
			padding: "8px 16px",
			fontSize: "14px",
			fontWeight: 500,
			cursor: "pointer",
			border: "none",
			background: "transparent",
			color: "var(--dsw-alias-label-secondary)",
			borderBottom: "2px solid transparent",
			transition: "color 0.2s, border-color 0.2s",
			display: "flex",
			alignItems: "center",
			gap: "6px",
		};

		const tabActiveStyle = {
			color: "var(--dsw-alias-accent)",
			borderBottom: "2px solid var(--dsw-alias-accent)",
		};

		const badgeStyle = {
			display: "inline-flex",
			alignItems: "center",
			justifyContent: "center",
			minWidth: "18px",
			height: "18px",
			padding: "0 5px",
			borderRadius: "9px",
			background: "var(--dsw-alias-label-error)",
			color: "#fff",
			fontSize: "11px",
			fontWeight: 600,
			lineHeight: "18px",
		};

		const skeletonStyle = {
			background: "var(--dsw-alias-bg-skeleton)",
			borderRadius: "8px",
			animation: "none",
		};

		// ─── Trigger icon/color map ───────────────────────────────────────────
		const triggerMeta = {
			tool_error: { icon: "🔴", labelKey: "triggerToolError" },
			user_correction: { icon: "🟡", labelKey: "triggerUserCorrection" },
			self_fix: { icon: "🟢", labelKey: "triggerSelfFix" },
		};

		// ─── Helpers ───────────────────────────────────────────────────────────
		function relativeTime(ts, t) {
			if (!ts) return "—";
			const diff = Date.now() - ts;
			const mins = Math.floor(diff / 60000);
			if (mins < 1) return "<1 min";
			if (mins < 60) return mins + " min";
			const hrs = Math.floor(mins / 60);
			if (hrs < 24) return hrs + " hr";
			const days = Math.floor(hrs / 24);
			return days + " " + t("days");
		}

		// ─── SkeletonCard ─────────────────────────────────────────────────────
		function SkeletonCard({ count }) {
			var items = [];
			for (var i = 0; i < (count || 3); i++) {
				items.push(j("div", {
					key: i,
					style: { ...cardStyle, padding: "16px 20px", marginBottom: "10px" },
					children: js("div", { children: [
						j("div", { style: { ...skeletonStyle, height: "14px", width: "60%", marginBottom: "10px" } }),
						j("div", { style: { ...skeletonStyle, height: "12px", width: "40%", marginBottom: "6px" } }),
						j("div", { style: { ...skeletonStyle, height: "12px", width: "30%" } }),
					]})
				}));
			}
			return j(react.Fragment, { children: items });
		}

		// ─── CorrectionCard (accordion) ───────────────────────────────────────
		function CorrectionCard({ correction, t, onExtract, onIgnore }) {
			var _useState = react.useState, useState = _useState[0], setExpanded = _useState[1];
			var expanded = useState(false);

			var meta = triggerMeta[correction.trigger] || { icon: "⚪", labelKey: "triggerToolError" };
			var triggerLabel = t(meta.labelKey);

			function toggleExpanded(e) {
				e.preventDefault();
				setExpanded(!expanded);
			}

			var triggerDot = j("span", {
				style: { fontSize: "12px", marginRight: "4px" },
				children: meta.icon,
			});

			return js("div", {
				style: { ...cardStyle, padding: "0", marginBottom: "10px", overflow: "hidden" },
				children: [
					// Collapsed header
					j("div", {
						style: { padding: "14px 20px", cursor: "pointer" },
						onClick: toggleExpanded,
						role: "button",
						"aria-expanded": expanded,
						tabIndex: 0,
						onKeyDown: function(e) { if (e.key === "Enter" || e.key === " ") toggleExpanded(e); },
						children: js("div", { style: { display: "flex", alignItems: "flex-start", gap: "10px" }, children: [
							// Left: icon + title + summary
							js("div", { style: { flex: 1, minWidth: 0 }, children: [
								js("div", { style: { display: "flex", alignItems: "center", gap: "6px", marginBottom: "4px" }, children: [
									triggerDot,
									j("span", { style: { fontSize: "13px", fontWeight: 600, color: "var(--dsw-alias-label-primary)" }, children: triggerLabel + " · " + (correction.error_summary || "") }),
								]}),
								j("div", { style: { fontSize: "12px", color: "var(--dsw-alias-label-tertiary)", marginLeft: "20px" }, children: correction.error_summary || "" }),
								j("div", { style: { fontSize: "11px", color: "var(--dsw-alias-label-tertiary)", marginTop: "4px", marginLeft: "20px" }, children: relativeTime(correction.created_at, t) }),
							]}),
							// Right: expand toggle + extract button
							js("div", { style: { display: "flex", alignItems: "center", gap: "8px", flexShrink: 0 }, children: [
								correction.status === "pending" ? j("button", {
									style: { ...btnPrimary, height: "28px", fontSize: "12px", padding: "0 10px" },
									onClick: function(e) { e.stopPropagation(); onExtract(correction); },
									children: t("extractRule"),
								}) : null,
								j("span", {
									style: { fontSize: "14px", color: "var(--dsw-alias-label-tertiary)", padding: "0 4px" },
									children: expanded ? "▲" : "▼",
								}),
							]}),
						]})
					}),
					// Expanded body
					expanded ? js("div", { style: { borderTop: "1px solid var(--dsw-alias-border-l2)", padding: "16px 20px" }, children: [
						correction.root_cause ? js("div", { style: { marginBottom: "10px" }, children: [
							j("div", { style: { display: "flex", alignItems: "center", gap: "4px", marginBottom: "4px" }, children: [
								j("span", { style: { fontSize: "12px" }, children: "📌" }),
								j("span", { style: { fontSize: "12px", fontWeight: 600, color: "var(--dsw-alias-label-primary)" }, children: t("rootCause") }),
							]}),
							j("div", { style: { fontSize: "13px", color: "var(--dsw-alias-label-secondary)", paddingLeft: "20px" }, children: correction.root_cause }),
						]}) : null,
						correction.correct_action ? js("div", { style: { marginBottom: "10px" }, children: [
							j("div", { style: { display: "flex", alignItems: "center", gap: "4px", marginBottom: "4px" }, children: [
								j("span", { style: { fontSize: "12px" }, children: "✅" }),
								j("span", { style: { fontSize: "12px", fontWeight: 600, color: "var(--dsw-alias-label-primary)" }, children: t("correctAction") }),
							]}),
							j("div", { style: { fontSize: "13px", color: "var(--dsw-alias-label-secondary)", paddingLeft: "20px" }, children: correction.correct_action }),
						]}) : null,
						correction.rule ? js("div", { style: { marginBottom: "10px" }, children: [
							j("div", { style: { display: "flex", alignItems: "center", gap: "4px", marginBottom: "4px" }, children: [
								j("span", { style: { fontSize: "12px" }, children: "🛡" }),
								j("span", { style: { fontSize: "12px", fontWeight: 600, color: "var(--dsw-alias-label-primary)" }, children: t("rule") }),
							]}),
							j("div", { style: { fontSize: "13px", color: "var(--dsw-alias-label-secondary)", paddingLeft: "20px" }, children: correction.rule }),
						]}) : null,
						correction.context ? js("div", { style: { marginBottom: "10px" }, children: [
							j("div", { style: { display: "flex", alignItems: "center", gap: "4px", marginBottom: "4px" }, children: [
								j("span", { style: { fontSize: "12px" }, children: "📎" }),
								j("span", { style: { fontSize: "12px", fontWeight: 600, color: "var(--dsw-alias-label-primary)" }, children: t("context") }),
							]}),
							j("div", { style: { fontSize: "12px", color: "var(--dsw-alias-label-tertiary)", paddingLeft: "20px" }, children: correction.context }),
						]}) : null,
						// Action buttons
						js("div", { style: { display: "flex", justifyContent: "flex-end", gap: "8px", marginTop: "12px" }, children: [
							j("button", {
								style: btnDanger,
								onClick: function() { onIgnore(correction); },
								children: t("ignore"),
							}),
							j("button", {
								style: { ...btnPrimary },
								onClick: function() { onExtract(correction); },
								children: t("extractRule"),
							}),
						]}),
					]}) : null,
				]
			});
		}

		// ─── CorrectionsTab ───────────────────────────────────────────────────
		function CorrectionsTab({ t, badges, setBadges, onError }) {
			var _useState = react.useState, useState = _useState[0], setExpanded = _useState[1];
			var _useEffect = react.useEffect;
			var correctionsState = _useState(null), setCorrections = correctionsState[1], corrections = correctionsState[0];
			var loadingState = _useState(true), setLoading = loadingState[1], loading = loadingState[0];
			var errorState = _useState(null), setError = errorState[1], error = errorState[0];
			var filterState = _useState("all"), setFilter = filterState[1], filter = filterState[0];
			var activeOpState = _useState(null), setActiveOp = activeOpState[1], activeOp = activeOpState[0];

			var filterOptions = [
				{ key: "all", label: t("filterAll") },
				{ key: "pending", label: t("filterPending") },
				{ key: "promoted", label: t("filterPromoted") },
				{ key: "ignored", label: t("filterIgnored") },
			];

			function loadCorrections() {
				setLoading(true);
				setError(null);
				fetch('/plugins/agent-evolve/api/corrections')
					.then(function(r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
					.then(function(data) {
						setCorrections(Array.isArray(data) ? data : (data.corrections || []));
						setLoading(false);
					})
					.catch(function(e) {
						setError(e.message || t("loadFailed"));
						setLoading(false);
					});
			}

			_useEffect(function() {
				loadCorrections();
			}, []);

			// Refresh badges when tab becomes active
			_useEffect(function() {
				fetch('/plugins/agent-evolve/api/stats')
					.then(function(r) { return r.json(); })
					.then(function(data) {
						setBadges(function(prev) {
							return { ...prev, lessons: data.corrections_pending || 0, rules: data.rules_proposed || 0 };
						});
					})
					.catch(function() {});
			}, [badges]);

			function doExtract(correction) {
				setActiveOp(correction.id);
				fetch('/plugins/agent-evolve/api/corrections/' + correction.id + '/extract', { method: 'POST' })
					.then(function(r) { return r.json(); })
					.then(function() {
						setActiveOp(null);
						loadCorrections();
						// Refresh badges
						fetch('/plugins/agent-evolve/api/stats')
							.then(function(r) { return r.json(); })
							.then(function(data) {
								setBadges(function(prev) {
									return { ...prev, lessons: data.corrections_pending || 0, rules: data.rules_proposed || 0 };
								});
							})
							.catch(function() {});
					})
					.catch(function() { setActiveOp(null); });
			}

			function doIgnore(correction) {
				setActiveOp(correction.id);
				fetch('/plugins/agent-evolve/api/corrections/' + correction.id + '/ignore', { method: 'POST' })
					.then(function(r) { return r.json(); })
					.then(function() {
						setActiveOp(null);
						loadCorrections();
					})
					.catch(function() { setActiveOp(null); });
			}

			var filteredCorrections = corrections ? corrections.filter(function(c) {
				if (filter === "all") return true;
				return c.status === filter;
			}) : [];

			if (loading) return j(SkeletonCard, { count: 3 });

			if (error) return js("div", { style: { textAlign: "center", padding: "40px 20px" }, children: [
				j("div", { style: { color: "var(--dsw-alias-label-error)", marginBottom: "12px", fontSize: "14px" }, children: t("loadFailed") }),
				j("button", { onClick: loadCorrections, style: btnPrimary, children: t("retry") }),
			]});

			if (corrections && corrections.length === 0) {
				return j("div", { style: { textAlign: "center", padding: "60px 20px", color: "var(--dsw-alias-label-tertiary)", fontSize: "14px" }, children: t("emptyLessons") });
			}

			return js("div", { children: [
				// Filter bar
				js("div", { style: { display: "flex", gap: "8px", marginBottom: "14px", flexWrap: "wrap" }, children: filterOptions.map(function(opt) {
					return j("button", {
						key: opt.key,
						onClick: function() { setFilter(opt.key); },
						style: {
							...btnPill,
							background: filter === opt.key ? "var(--dsw-alias-accent)" : "transparent",
							color: filter === opt.key ? "var(--dsw-alias-label-primary-foreground)" : "var(--dsw-alias-label-secondary)",
							borderColor: filter === opt.key ? "var(--dsw-alias-accent)" : "var(--dsw-alias-border-l2)",
						},
						children: opt.label,
					});
				})}),
				// Cards
				filteredCorrections.map(function(c) {
					return j(CorrectionCard, {
						key: c.id,
						correction: c,
						t: t,
						onExtract: doExtract,
						onIgnore: doIgnore,
					});
				}),
			]});
		}

		// ─── RulesTab (M0: empty state only) ─────────────────────────────────
		function RulesTab({ t }) {
			return j("div", { style: { textAlign: "center", padding: "60px 20px", color: "var(--dsw-alias-label-tertiary)", fontSize: "14px" }, children: t("emptyRules") });
		}

		// ─── MemoriesTab (M0: empty state only) ───────────────────────────────
		function MemoriesTab({ t }) {
			return j("div", { style: { textAlign: "center", padding: "60px 20px", color: "var(--dsw-alias-label-tertiary)", fontSize: "14px" }, children: t("emptyMemories") });
		}

		// ─── PersonaTab (M0: empty state only) ───────────────────────────────
		function PersonaTab({ t }) {
			return j("div", { style: { textAlign: "center", padding: "60px 20px", color: "var(--dsw-alias-label-tertiary)", fontSize: "14px" }, children: t("emptyPersona") });
		}

		// ─── BottomStatsBar ───────────────────────────────────────────────────
		function BottomStatsBar({ stats, t, enabled }) {
			var _useState = react.useState, useState = _useState[0], setStats = _useState[1];
			var _useEffect = react.useEffect;

			_useEffect(function() {
				fetch('/plugins/agent-evolve/api/stats')
					.then(function(r) { return r.json(); })
					.then(function(data) { setStats(data); })
					.catch(function() {});
			}, []);

			var s = stats || {};

			if (!enabled) {
				return js("div", {
					style: {
						borderTop: "1px solid var(--dsw-alias-border-l2)",
						padding: "10px 20px",
						display: "flex",
						gap: "20px",
						fontSize: "12px",
						color: "var(--dsw-alias-label-tertiary)",
					},
					children: [
						j("span", { children: t("lineLessons") + ": " + t("statsPaused") }),
						j("span", { children: t("lineRules") + ": " + t("statsPaused") }),
						j("span", { children: t("lineMemories") + ": " + t("statsPaused") }),
					],
				});
			}

			return js("div", {
				style: {
					borderTop: "1px solid var(--dsw-alias-border-l2)",
					padding: "10px 20px",
					display: "flex",
					gap: "20px",
					fontSize: "12px",
					color: "var(--dsw-alias-label-secondary)",
					flexWrap: "wrap",
				},
				children: [
					// Lessons line
					js("span", { key: "l1", style: { display: "flex", gap: "16px" }, children: [
						j("span", { key: "l1a", children: [t("lineLessons"), "：", t("statsCaptured"), " ", j("b", { style: { color: "var(--dsw-alias-label-primary)" }, children: s.corrections_captured || 0 }), " │ ", t("statsExtracted"), " ", j("b", { style: { color: "var(--dsw-alias-label-primary)" }, children: s.corrections_promoted || 0 })] }),
					]}),
					// Rules line
					js("span", { key: "l2", style: { display: "flex", gap: "16px" }, children: [
						j("span", { key: "l2a", children: [t("lineRules"), "：", t("statsProposed"), " ", j("b", { style: { color: "var(--dsw-alias-label-primary)" }, children: s.rules_proposed || 0 }), " │ ", t("statsApproved"), " ", j("b", { style: { color: "var(--dsw-alias-label-primary)" }, children: s.rules_approved || 0 })] }),
					]}),
					// Memories line
					js("span", { key: "l3", style: { display: "flex", gap: "16px" }, children: [
						j("span", { key: "l3a", children: [t("lineMemories"), "：", t("statsExtractions"), " ", j("b", { style: { color: "var(--dsw-alias-label-primary)" }, children: s.memories_extracted || 0 }), " │ ", t("statsPersonaUpdated"), " ", s.persona_updated_at ? (Math.floor((Date.now() - s.persona_updated_at) / 86400000) + " " + t("statsDaysAgo")) : t("statsNever") ] }),
					]}),
				],
			});
		}

		// ─── AgentEvolveSettingsTab (main component) ─────────────────────────
		function AgentEvolveSettingsTab({ t }) {
			var _useState = react.useState, useState = _useState[0], setState = _useState[1];
			var _useEffect = react.useEffect;

			var enabledState = _useState(true), setEnabled = enabledState[1], enabled = enabledState[0];
			var configOpenState = _useState(false), setConfigOpen = configOpenState[1], configOpen = configOpenState[0];
			var activeTabState = _useState("lessons"), setActiveTab = activeTabState[1], activeTab = activeTabState[0];
			var badgesState = _useState({ lessons: 0, rules: 0 }), setBadges = badgesState[1], badges = badgesState[0];
			var statsState = _useState(null), setStats = statsState[1], stats = statsState[0];

			// Load initial config
			_useEffect(function() {
				fetch('/plugins/agent-evolve/api/config')
					.then(function(r) { return r.json(); })
					.then(function(data) {
						if (data && data.enabled !== undefined) setEnabled(data.enabled);
					})
					.catch(function() {});
				fetch('/plugins/agent-evolve/api/stats')
					.then(function(r) { return r.json(); })
					.then(function(data) { setStats(data); setBadges({ lessons: data.corrections_pending || 0, rules: data.rules_proposed || 0 }); })
					.catch(function() {});
			}, []);

			function toggleEnabled() {
				var next = !enabled;
				setEnabled(next);
				fetch('/plugins/agent-evolve/api/config', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ enabled: next }),
				}).catch(function() {});
			}

			var tabs = [
				{ id: "lessons", label: t("tabLessons"), badge: badges.lessons },
				{ id: "rules", label: t("tabRules"), badge: badges.rules },
				{ id: "memories", label: t("tabMemories"), badge: null },
				{ id: "persona", label: t("tabPersona"), badge: null },
			];

			return js("div", { style: { display: "flex", flexDirection: "column", height: "100%" }, children: [
				// ── Header ──
				js("div", { style: { padding: "16px 20px 0", borderBottom: "1px solid var(--dsw-alias-border-l2)" }, children: [
					js("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "6px" }, children: [
						js("div", { children: [
							j("h2", { style: { ...headerStyle, fontSize: "18px", marginBottom: "2px" }, children: t("title") }),
							j("p", { style: { fontSize: "12px", color: "var(--dsw-alias-label-tertiary)", margin: "0" }, children: t("subtitle") }),
						]}),
						js("div", { style: { display: "flex", alignItems: "center", gap: "10px" }, children: [
							j("button", {
								style: { ...btnOutline, height: "30px", fontSize: "12px" },
								onClick: function() { setConfigOpen(!configOpen); },
								children: t("configBtn"),
							}),
							j("button", {
								onClick: toggleEnabled,
								style: {
									height: "30px",
									padding: "0 14px",
									borderRadius: "15px",
									border: "none",
									fontSize: "13px",
									fontWeight: 600,
									cursor: "pointer",
									background: enabled ? "var(--dsw-alias-state-success-primary)" : "var(--dsw-alias-bg-skeleton)",
									color: enabled ? "#fff" : "var(--dsw-alias-label-tertiary)",
									transition: "background 0.2s, color 0.2s",
								},
								"aria-label": enabled ? t("switchOn") : t("switchOff"),
								children: enabled ? t("switchOn") : t("switchOff"),
							}),
						]}),
					]}),
					// Advanced config (inline expand)
					configOpen ? j("div", { style: { padding: "12px 0 4px" }, children:
						js("div", { style: { ...cardStyle, padding: "16px 20px" }, children: [
							js("div", { style: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }, children: [
								// Batch size
								js("div", { children: [
									j("div", { style: labelStyle, children: t("batchSize") }),
									j("input", { type: "number", defaultValue: 3, min: 1, max: 100, style: inputStyle }),
								]}),
								// Embedding
								js("div", { children: [
									j("div", { style: labelStyle, children: t("embedding") }),
									j("select", { defaultValue: "auto", style: selectStyle, children: [
										j("option", { value: "auto", children: t("embeddingAuto") }),
										j("option", { value: "none", children: t("embeddingNone") }),
										j("option", { value: "custom", children: t("embeddingCustom") }),
									]}),
								]}),
								// Model
								js("div", { children: [
									j("div", { style: labelStyle, children: t("modelSelect") }),
									j("select", { defaultValue: "auto", style: selectStyle, children: [
										j("option", { value: "auto", children: t("modelFollowCurrent") }),
										j("option", { value: "custom", children: t("modelCustom") }),
									]}),
								]}),
								// Threshold
								js("div", { children: [
									j("div", { style: labelStyle, children: t("promoteThreshold") }),
									j("input", { type: "number", defaultValue: 5, min: 1, max: 100, style: inputStyle }),
								]}),
							]}),
							// Embedding status line
							js("div", { style: { marginTop: "10px", fontSize: "12px", color: "var(--dsw-alias-label-tertiary)" }, children: [
								t("embeddingStatus"), "：", j("span", { style: { color: "var(--dsw-alias-state-success-primary)" }, children: "bge-m3 " + t("embeddingEnabled") }),
							]}),
						]})
					}) : null,
				]}),

				// ── Tab bar ──
				js("div", {
					role: "tablist",
					style: {
						display: "flex",
						borderBottom: "1px solid var(--dsw-alias-border-l2)",
						background: "var(--dsw-alias-bg-layer-1)",
						padding: "0 20px",
					},
					children: tabs.map(function(tab) {
						var isActive = activeTab === tab.id;
						return js("button", {
							key: tab.id,
							role: "tab",
							"aria-selected": isActive,
							onClick: function() { setActiveTab(tab.id); },
							style: { ...tabStyle, ...(isActive ? tabActiveStyle : {}) },
							children: [
								j("span", { key: "label", children: tab.label }),
								tab.badge && tab.badge > 0 ? j("span", { key: "badge", style: badgeStyle, "aria-label": String(tab.badge), children: tab.badge }) : null,
							],
						});
					})
				}),

				// ── Tab content ──
				js("div", {
					role: "tabpanel",
					style: {
						flex: 1,
						overflowY: "auto",
						padding: "16px 20px",
						maxHeight: "60vh",
					},
					children: activeTab === "lessons" ? j(CorrectionsTab, { t: t, badges: badges, setBadges: setBadges }) :
						activeTab === "rules" ? j(RulesTab, { t: t }) :
						activeTab === "memories" ? j(MemoriesTab, { t: t }) :
						j(PersonaTab, { t: t }),
				}),

				// ── Bottom stats bar ──
				j(BottomStatsBar, { stats: stats, t: t, enabled: enabled }),
			]});
		}

		// ─── Cordis apply ────────────────────────────────────────────────────
		const inject = ["slots", "locale"];

		function apply(ctx) {
			ctx.effect(() => ctx.locale.register(NS, { zh, en }), "agent-evolve: dictionaries");
			const t = ctx.locale.bind(NS);
			ctx.slots.inject("settings.plugins.tab", () =>
				ctx.slots.register(
					{
						name: "settings.plugins.tab",
						id: "agent-evolve",
						order: 22,
						label: () => t("tab"),
						locale: NS,
						inject: () => ({}),
					},
					AgentEvolveSettingsTab
				)
			);
		}

		exports.NS = NS;
		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	},
});
