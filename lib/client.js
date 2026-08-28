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
			// M3: extended config knobs
			llmTimeout: "LLM 超时",
			llmTimeoutUnit: "ms",
			signalWordsHint: "用逗号分隔多个信号词",
			signalWordsPlaceholder: "例如：不对, 错了, 不对劲",
			saveConfig: "保存配置",
			savingConfig: "保存中...",
			saveSuccess: "已保存",
			saveFailed: "保存失败",
			embeddingTest: "测试连接",
			embeddingTesting: "测试中...",
			embeddingTestOk: "连接正常",
			embeddingTestFail: "连接失败",
			embeddingModelLabel: "模型",
			embeddingProviderLabel: "提供方",
			embeddingBaseUrlLabel: "Ollama 地址",
			embeddingTimeoutLabel: "超时",
			embeddingProbeAt: "上次探测",
			embeddingDisabled: "未启用",
			activeMemoryBadge: "活跃",
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
			rejectConfirm: "确认拒绝这条规则？此操作不可撤销。",
			graduable: "可晋升",
			graduated: "已晋升",
			emptyApproved: "暂无已批准规则",
			editRule: "编辑规则",
			promoteRule: "晋升到 AGENTS.md",
			promoteDraft: "AGENTS.md 草稿",
			promoteHint: "确认无误后请粘贴到 AGENTS.md 对应章节。",
			promoteError: "晋升失败，请重试",
			category: "类别",
			tagsLabel: "标签",
			tagsHint: "用逗号分隔",
			hitCount: "命中次数",
			lastHit: "最后命中",
			never: "从未",
			correctionsLabel: "关联教训",
			moreSource: "等 {n} 条",
			categoryCoding: "编码",
			categoryCommunication: "沟通",
			categoryWorkflow: "工作流",
			categorySafety: "安全",
			save: "保存",
			saving: "保存中...",
			cancel: "取消",
			copy: "复制",
			copied: "已复制",
			copyHint: "已复制，请手动粘贴到 AGENTS.md",
			contentLabel: "规则内容",
			contentPlaceholder: "请描述这条规则的具体内容...",
			promoteLoading: "生成草稿中...",
			contentRequired: "规则内容不能为空",
			operationFailed: "操作失败：{msg}",
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
			// Memories tab
			memSearchPlaceholder: "搜索记忆内容或标签...",
			memNoResults: "没有匹配的记忆",
			memTypePreference: "偏好",
			memTypeFact: "事实",
			memTypeDecision: "决策",
			memTypeSkill: "技能",
			memOriginExtracted: "抽取",
			memOriginCorrected: "纠正",
			memOriginManual: "手动",
			memStatusActive: "活跃",
			memStatusSuperseded: "已替代",
			memStatusArchived: "已归档",
			memWeight: "权重",
			memAccess: "访问",
			memArchive: "归档",
			memArchiveConfirm: "归档这条记忆？",
			memDelete: "删除",
			memDeleteConfirm: "确认删除这条记忆？此操作不可撤销。",
			memArchiveSuccess: "已归档",
			memDeleteSuccess: "已删除",
			memSearchHint: "回车搜索",
			// Persona tab
			personaRebuild: "重建画像",
			personaRebuilding: "重建中...",
			personaLastUpdated: "上次更新",
			personaConfidence: "置信度",
			personaEmptyHint: "暂无画像 — 积累足够记忆后可重建画像",
			personaTechStack: "技术栈",
			personaCodingStyle: "编码风格",
			personaCommunication: "沟通偏好",
			personaCommonTasks: "常见任务",
			personaEditValue: "编辑画像",
			personaValueLabel: "画像内容",
			personaValuePlaceholder: "请输入画像内容...",
			personaRebuildSuccess: "画像重建成功",
			personaRebuildFailed: "重建失败，请重试",
			personaEmpty: "（暂无内容）",
			personaSaveSuccess: "已保存",
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
			// M3: extended config knobs
			llmTimeout: "LLM timeout",
			llmTimeoutUnit: "ms",
			signalWordsHint: "Comma-separated signal words",
			signalWordsPlaceholder: "e.g. wrong, incorrect, no that's not right",
			saveConfig: "Save Config",
			savingConfig: "Saving...",
			saveSuccess: "Saved",
			saveFailed: "Save failed",
			embeddingTest: "Test Connection",
			embeddingTesting: "Testing...",
			embeddingTestOk: "Connected",
			embeddingTestFail: "Failed",
			embeddingModelLabel: "Model",
			embeddingProviderLabel: "Provider",
			embeddingBaseUrlLabel: "Ollama URL",
			embeddingTimeoutLabel: "Timeout",
			embeddingProbeAt: "Last probe",
			embeddingDisabled: "Disabled",
			activeMemoryBadge: "Active",
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
			rejectConfirm: "Reject this rule? This action cannot be undone.",
			graduable: "Can Graduate",
			graduated: "Graduated",
			emptyApproved: "No approved rules yet",
			editRule: "Edit Rule",
			promoteRule: "Promote to AGENTS.md",
			promoteDraft: "AGENTS.md Draft",
			promoteHint: "After verification, paste it into the matching section of AGENTS.md.",
			promoteError: "Promotion failed. Please retry.",
			category: "Category",
			tagsLabel: "Tags",
			tagsHint: "Comma-separated",
			hitCount: "Hits",
			lastHit: "Last Hit",
			never: "never",
			correctionsLabel: "Linked Lessons",
			moreSource: "and {n} more",
			categoryCoding: "Coding",
			categoryCommunication: "Communication",
			categoryWorkflow: "Workflow",
			categorySafety: "Safety",
			save: "Save",
			saving: "Saving...",
			cancel: "Cancel",
			copy: "Copy",
			copied: "Copied",
			copyHint: "Copied. Paste into AGENTS.md manually.",
			contentLabel: "Rule content",
			contentPlaceholder: "Describe what this rule enforces...",
			promoteLoading: "Generating draft...",
			contentRequired: "Rule content cannot be empty",
			operationFailed: "Operation failed: {msg}",
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
			// Memories tab
			memSearchPlaceholder: "Search memory content or tags...",
			memNoResults: "No matching memories",
			memTypePreference: "Preference",
			memTypeFact: "Fact",
			memTypeDecision: "Decision",
			memTypeSkill: "Skill",
			memOriginExtracted: "Extracted",
			memOriginCorrected: "Corrected",
			memOriginManual: "Manual",
			memStatusActive: "Active",
			memStatusSuperseded: "Superseded",
			memStatusArchived: "Archived",
			memWeight: "Weight",
			memAccess: "Hits",
			memArchive: "Archive",
			memArchiveConfirm: "Archive this memory?",
			memDelete: "Delete",
			memDeleteConfirm: "Delete this memory? This action cannot be undone.",
			memArchiveSuccess: "Archived",
			memDeleteSuccess: "Deleted",
			memSearchHint: "Press Enter to search",
			// Persona tab
			personaRebuild: "Rebuild Persona",
			personaRebuilding: "Rebuilding...",
			personaLastUpdated: "Last updated",
			personaConfidence: "Confidence",
			personaEmptyHint: "No persona yet — rebuild after accumulating enough memories",
			personaTechStack: "Tech Stack",
			personaCodingStyle: "Coding Style",
			personaCommunication: "Communication",
			personaCommonTasks: "Common Tasks",
			personaEditValue: "Edit Persona",
			personaValueLabel: "Persona value",
			personaValuePlaceholder: "Enter persona content...",
			personaRebuildSuccess: "Persona rebuilt",
			personaRebuildFailed: "Rebuild failed, please retry",
			personaEmpty: "(empty)",
			personaSaveSuccess: "Saved",
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

		// ─── Category icon/color map ─────────────────────────────────────────
		const categoryMeta = {
			coding: { icon: "💻", labelKey: "categoryCoding", fg: "#60a5fa", bg: "rgba(96,165,250,0.12)", border: "rgba(96,165,250,0.35)" },
			communication: { icon: "💬", labelKey: "categoryCommunication", fg: "#4ade80", bg: "rgba(74,222,128,0.12)", border: "rgba(74,222,128,0.35)" },
			workflow: { icon: "⚙️", labelKey: "categoryWorkflow", fg: "#fb923c", bg: "rgba(251,146,60,0.12)", border: "rgba(251,146,60,0.35)" },
			safety: { icon: "🛡", labelKey: "categorySafety", fg: "#f87171", bg: "rgba(248,113,113,0.12)", border: "rgba(248,113,113,0.35)" },
		};

		// ─── Memory type / origin meta ──────────────────────────────────────
		const memoryTypeMeta = {
			preference: { icon: "👤", labelKey: "memTypePreference", fg: "#c084fc", bg: "rgba(192,132,252,0.12)", border: "rgba(192,132,252,0.35)" },
			fact:       { icon: "📌", labelKey: "memTypeFact",       fg: "#60a5fa", bg: "rgba(96,165,250,0.12)",  border: "rgba(96,165,250,0.35)" },
			decision:   { icon: "🎯", labelKey: "memTypeDecision",   fg: "#fbbf24", bg: "rgba(251,191,36,0.12)",  border: "rgba(251,191,36,0.35)" },
			skill:      { icon: "🛠", labelKey: "memTypeSkill",      fg: "#4ade80", bg: "rgba(74,222,128,0.12)",  border: "rgba(74,222,128,0.35)" },
		};

		const memoryOriginMeta = {
			extracted: { icon: "🤖", labelKey: "memOriginExtracted" },
			corrected: { icon: "✏️", labelKey: "memOriginCorrected" },
			manual:    { icon: "👆", labelKey: "memOriginManual" },
		};

		// ─── Persona dimension meta ──────────────────────────────────────────
		const personaDimMeta = {
			tech_stack:     { icon: "💻", labelKey: "personaTechStack" },
			coding_style:   { icon: "✍️", labelKey: "personaCodingStyle" },
			communication:  { icon: "💬", labelKey: "personaCommunication" },
			common_tasks:   { icon: "📋", labelKey: "personaCommonTasks" },
		};

		// ─── Progress bar style helper ───────────────────────────────────────
		const progressTrackStyle = {
			height: "6px",
			background: "var(--dsw-alias-bg-skeleton)",
			borderRadius: "3px",
			overflow: "hidden",
			flex: 1,
		};

		const progressFillStyle = function(pct, color) {
			return {
				height: "100%",
				width: Math.max(0, Math.min(100, (pct || 0) * 100)) + "%",
				background: color || "var(--dsw-alias-accent)",
				transition: "width 0.3s ease-out",
				borderRadius: "3px",
			};
		};

		// ─── Modal styles ────────────────────────────────────────────────────
		const modalBackdropStyle = {
			position: "fixed",
			inset: "0",
			background: "rgba(0,0,0,0.55)",
			display: "flex",
			alignItems: "center",
			justifyContent: "center",
			zIndex: 9999,
			backdropFilter: "blur(2px)",
		};

		const modalCardStyle = {
			background: "var(--dsw-alias-bg-layer-2)",
			borderRadius: "12px",
			padding: "20px",
			width: "520px",
			maxWidth: "92vw",
			maxHeight: "85vh",
			overflow: "auto",
			border: "1px solid var(--dsw-alias-border-l2)",
			boxShadow: "0 20px 40px rgba(0,0,0,0.5)",
			boxSizing: "border-box",
		};

		const modalTitleStyle = {
			fontSize: "15px",
			fontWeight: 600,
			color: "var(--dsw-alias-label-primary)",
			margin: "0 0 14px",
			display: "flex",
			alignItems: "center",
			justifyContent: "space-between",
			gap: "8px",
		};

		const modalCloseStyle = {
			background: "transparent",
			border: "none",
			color: "var(--dsw-alias-label-tertiary)",
			fontSize: "18px",
			cursor: "pointer",
			padding: "0 4px",
			lineHeight: 1,
		};

		const modalFooterStyle = {
			display: "flex",
			justifyContent: "flex-end",
			gap: "8px",
			marginTop: "16px",
		};

		const textareaStyle = {
			minHeight: "110px",
			padding: "10px 12px",
			background: "var(--dsw-alias-bg-input)",
			color: "var(--dsw-alias-label-primary)",
			border: "1px solid var(--dsw-alias-border-l2)",
			borderRadius: "8px",
			fontSize: "13px",
			lineHeight: 1.5,
			outline: "none",
			width: "100%",
			resize: "vertical",
			fontFamily: "inherit",
			boxSizing: "border-box",
		};

		const codeBlockStyle = {
			padding: "12px 14px",
			background: "var(--dsw-alias-bg-layer-1)",
			color: "var(--dsw-alias-label-primary)",
			border: "1px solid var(--dsw-alias-border-l2)",
			borderRadius: "8px",
			fontSize: "12px",
			lineHeight: 1.6,
			whiteSpace: "pre-wrap",
			wordBreak: "break-word",
			fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
			maxHeight: "360px",
			overflow: "auto",
			margin: 0,
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
		function CorrectionCard({ correction, t, onExtract, onIgnore, highlighted }) {
			var _useState = react.useState, useState = _useState[0], setExpanded = _useState[1];
			var _useEffect = react.useEffect;
			var _useRef = react.useRef;
			var expandedState = _useState(false), setExpanded = expandedState[1], expanded = expandedState[0];
			var pulsingState = _useState(false), setPulsing = pulsingState[1], pulsing = pulsingState[0];
			var cardRef = _useRef(null);

			var meta = triggerMeta[correction.trigger] || { icon: "⚪", labelKey: "triggerToolError" };
			var triggerLabel = t(meta.labelKey);

			_useEffect(function() {
				if (highlighted && cardRef.current) {
					try {
						cardRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
					} catch (e) {}
					setPulsing(true);
					var timer = setTimeout(function() { setPulsing(false); }, 2200);
					return function() { clearTimeout(timer); };
				}
			}, [highlighted]);

			function toggleExpanded(e) {
				e.preventDefault();
				setExpanded(!expanded);
			}

			var triggerDot = j("span", {
				style: { fontSize: "12px", marginRight: "4px" },
				children: meta.icon,
			});

			return js("div", {
				ref: cardRef,
				style: {
					...cardStyle,
					padding: "0",
					marginBottom: "10px",
					overflow: "hidden",
					boxShadow: pulsing ? "0 0 0 2px var(--dsw-alias-accent), 0 0 16px rgba(96,165,250,0.45)" : "none",
					transition: "box-shadow 0.4s ease-out",
					borderColor: pulsing ? "var(--dsw-alias-accent)" : "var(--dsw-alias-border-l2)",
				},
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
		function CorrectionsTab({ t, badges, setBadges, onError, highlightId, onClearHighlight }) {
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

			// Handle highlight: ensure target is visible & auto-clear after pulse
			_useEffect(function() {
				if (!highlightId) return;
				// Force filter to "all" so the target correction is visible regardless of its status
				if (filter !== "all") setFilter("all");
				// Auto-clear highlight after pulse window
				var timer = setTimeout(function() {
					if (onClearHighlight) onClearHighlight();
				}, 2600);
				return function() { clearTimeout(timer); };
			}, [highlightId]);

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
						highlighted: !!(highlightId && c.id === highlightId),
					});
				}),
			]});
		}

		// ─── Modal (generic overlay) ─────────────────────────────────────────
		function Modal({ title, onClose, children, footer, width }) {
			var _useEffect = react.useEffect;
			_useEffect(function() {
				function onKey(e) {
					if (e.key === "Escape") {
						e.stopPropagation();
						onClose();
					}
				}
				document.addEventListener("keydown", onKey);
				return function() { document.removeEventListener("keydown", onKey); };
			}, [onClose]);
			function onBackdropClick(e) {
				if (e.target === e.currentTarget) onClose();
			}
			return j("div", {
				style: modalBackdropStyle,
				onClick: onBackdropClick,
				role: "dialog",
				"aria-modal": "true",
				children: j("div", {
					style: width ? Object.assign({}, modalCardStyle, { width: width }) : modalCardStyle,
					onClick: function(e) { e.stopPropagation(); },
					children: js("div", { children: [
						j("div", { style: modalTitleStyle, children: [
							j("span", { key: "t", children: title }),
							j("button", {
								key: "x",
								style: modalCloseStyle,
								onClick: onClose,
								"aria-label": "close",
								children: "×",
							}),
						]}),
						j("div", { key: "body", children: children }),
						footer ? j("div", { key: "footer", style: modalFooterStyle, children: footer }) : null,
					]})
				}),
			});
		}

		// ─── RuleCard (pending / approved) ───────────────────────────────────
		function CategoryBadge({ category, t }) {
			var meta = categoryMeta[category] || categoryMeta.coding;
			return j("span", {
				style: {
					display: "inline-flex",
					alignItems: "center",
					gap: "4px",
					padding: "2px 8px",
					borderRadius: "6px",
					background: meta.bg,
					color: meta.fg,
					border: "1px solid " + meta.border,
					fontSize: "11px",
					fontWeight: 500,
					whiteSpace: "nowrap",
				},
				children: [meta.icon, " ", t(meta.labelKey)],
			});
		}

		function TagPill({ tag }) {
			return j("span", {
				style: {
					display: "inline-flex",
					alignItems: "center",
					padding: "1px 8px",
					borderRadius: "10px",
					background: "var(--dsw-alias-bg-layer-1)",
					color: "var(--dsw-alias-label-tertiary)",
					border: "1px solid var(--dsw-alias-border-l2)",
					fontSize: "11px",
					marginRight: "4px",
					marginBottom: "4px",
				},
				children: "#" + tag,
			});
		}

		function SourceChip({ correctionId, onClick, t }) {
			var shortId = correctionId.length > 10 ? correctionId.slice(0, 10) + "…" : correctionId;
			return j("span", {
				style: {
					display: "inline-flex",
					alignItems: "center",
					gap: "3px",
					padding: "1px 8px",
					borderRadius: "10px",
					background: "transparent",
					color: "var(--dsw-alias-accent)",
					border: "1px solid var(--dsw-alias-border-l2)",
					fontSize: "11px",
					cursor: "pointer",
					marginRight: "4px",
					marginBottom: "4px",
				},
				title: t("correctionsLabel") + ": " + correctionId,
				onClick: function() { onClick(correctionId); },
				children: "📎 " + shortId,
			});
		}

		function RuleCard({ rule, kind, t, onApprove, onReject, onEdit, onPromote, onJumpToCorrection, busy }) {
			var sources = rule.source_correction_ids || rule.correction_ids || rule.sources || [];
			var maxShown = 3;
			var shownSources = sources.slice(0, maxShown);
			var remaining = sources.length - shownSources.length;

			function renderMetaLine() {
				if (kind === "approved") {
					var lastHitTxt = rule.last_hit_at
						? relativeTime(rule.last_hit_at, t)
						: t("never");
					return js("div", { style: { display: "flex", gap: "12px", fontSize: "11px", color: "var(--dsw-alias-label-tertiary)", marginTop: "8px" }, children: [
						j("span", { key: "h", children: [t("hitCount"), ": ", j("b", { style: { color: "var(--dsw-alias-label-primary)" }, children: rule.hit_count || 0 })] }),
						j("span", { key: "l", children: [t("lastHit"), ": ", lastHitTxt] }),
					]});
				}
				return null;
			}

			function renderActions() {
				if (kind === "pending") {
					return js("div", { style: { display: "flex", gap: "8px", flexShrink: 0 }, children: [
						j("button", {
							key: "reject",
							style: Object.assign({}, btnDanger, { opacity: busy ? 0.5 : 1 }),
							disabled: busy,
							onClick: function() { onReject(rule); },
							children: t("reject"),
						}),
						j("button", {
							key: "edit",
							style: Object.assign({}, btnOutline, { opacity: busy ? 0.5 : 1 }),
							disabled: busy,
							onClick: function() { onEdit(rule); },
							children: t("edit"),
						}),
						j("button", {
							key: "approve",
							style: Object.assign({}, btnPrimary, { opacity: busy ? 0.5 : 1 }),
							disabled: busy,
							onClick: function() { onApprove(rule); },
							children: t("approve"),
						}),
					]});
				}
				// approved
				var buttons = [
					j("button", {
						key: "edit",
						style: Object.assign({}, btnOutline, { opacity: busy ? 0.5 : 1 }),
						disabled: busy,
						onClick: function() { onEdit(rule); },
						children: t("edit"),
					}),
				];
				if ((rule.hit_count || 0) > 20) {
					buttons.push(j("button", {
						key: "promote",
						style: {
							height: "32px",
							padding: "0 14px",
							background: "transparent",
							color: "#fbbf24",
							border: "1px solid #fbbf24",
							borderRadius: "8px",
							fontSize: "13px",
							cursor: "pointer",
							fontWeight: 500,
							opacity: busy ? 0.5 : 1,
						},
						disabled: busy,
						onClick: function() { onPromote(rule); },
						children: "⭐ " + t("graduable"),
					}));
				}
				return js("div", { style: { display: "flex", gap: "8px", flexShrink: 0 }, children: buttons });
			}

			return js("div", {
				style: Object.assign({}, cardStyle, { padding: "14px 18px", marginBottom: "10px" }),
				children: [
					// Top: category + tags
					js("div", { key: "top", style: { display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap", marginBottom: "8px" }, children: [
						j(CategoryBadge, { key: "cat", category: rule.category, t: t }),
						(rule.tags || []).map(function(tag, i) {
							return j(TagPill, { key: "tag-" + i, tag: tag });
						}),
					]}),
					// Content
					j("div", {
						key: "content",
						style: {
							fontSize: "13px",
							lineHeight: 1.55,
							color: "var(--dsw-alias-label-primary)",
							padding: "6px 0",
							wordBreak: "break-word",
						},
						children: rule.content || "",
					}),
					// Meta + Actions row
					js("div", { key: "row", style: { display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: "12px", marginTop: "10px", flexWrap: "wrap" }, children: [
						js("div", { key: "left", style: { flex: 1, minWidth: 0 }, children: [
							renderMetaLine(),
							sources.length > 0 ? js("div", { style: { marginTop: "6px", display: "flex", alignItems: "center", flexWrap: "wrap" }, children: [
								j("span", { key: "label", style: { fontSize: "11px", color: "var(--dsw-alias-label-tertiary)", marginRight: "6px" }, children: "🔗 " + t("ruleSource") + ":" }),
								shownSources.map(function(sid) {
									return j(SourceChip, { key: sid, correctionId: sid, onClick: onJumpToCorrection, t: t });
								}),
								remaining > 0 ? j("span", {
									key: "more",
									style: { fontSize: "11px", color: "var(--dsw-alias-label-tertiary)", marginLeft: "4px" },
									children: t("moreSource", { n: remaining }),
								}) : null,
							]}) : null,
						]}),
						renderActions(),
					]}),
				]
			});
		}

		// ─── EditModal ────────────────────────────────────────────────────────
		function EditModal({ rule, onSave, onClose, t }) {
			var _useState = react.useState, useState = _useState[0], setState = _useState[1];
			var contentState = _useState(rule.content || ""), setContent = contentState[1], content = contentState[0];
			var categoryState = _useState(rule.category || "coding"), setCategory = categoryState[1], category = categoryState[0];
			var tagsStrState = _useState((rule.tags || []).join(", ")), setTagsStr = tagsStrState[1], tagsStr = tagsStrState[0];
			var savingState = _useState(false), setSaving = savingState[1], saving = savingState[0];
			var errorState = _useState(null), setError = errorState[1], error = errorState[0];

			function onSaveClick() {
				if (!content.trim()) {
					setError(t("contentRequired"));
					return;
				}
				setError(null);
				setSaving(true);
				var tags = tagsStr.split(",").map(function(s) { return s.trim(); }).filter(Boolean);
				Promise.resolve(onSave({ content: content.trim(), category: category, tags: tags }))
					.catch(function(e) {
						setError((e && e.message) || t("operationFailed", { msg: "unknown" }));
					})
					.then(function() {
						setSaving(false);
					});
			}

			return j(Modal, {
				title: "✏️ " + t("editRule"),
				onClose: saving ? function() {} : onClose,
				footer: js("div", { children: [
					j("button", {
						key: "cancel",
						style: btnOutline,
						disabled: saving,
						onClick: onClose,
						children: t("cancel"),
					}),
					j("button", {
						key: "save",
						style: Object.assign({}, btnPrimary, { opacity: saving ? 0.6 : 1 }),
						disabled: saving,
						onClick: onSaveClick,
						children: saving ? t("saving") : t("save"),
					}),
				]}),
				children: js("div", { children: [
					// Content
					js("div", { key: "c", style: { marginBottom: "12px" }, children: [
						j("div", { style: { fontSize: "12px", fontWeight: 600, color: "var(--dsw-alias-label-primary)", marginBottom: "6px" }, children: t("contentLabel") + " *" }),
						j("textarea", {
							style: textareaStyle,
							value: content,
							placeholder: t("contentPlaceholder"),
							onChange: function(e) { setContent(e.target.value); },
							disabled: saving,
						}),
					]}),
					// Category
					js("div", { key: "cat", style: { marginBottom: "12px" }, children: [
						j("div", { style: { fontSize: "12px", fontWeight: 600, color: "var(--dsw-alias-label-primary)", marginBottom: "6px" }, children: t("category") }),
						j("select", {
							style: selectStyle,
							value: category,
							disabled: saving,
							onChange: function(e) { setCategory(e.target.value); },
							children: [
								j("option", { key: "coding", value: "coding", children: "💻 " + t("categoryCoding") }),
								j("option", { key: "communication", value: "communication", children: "💬 " + t("categoryCommunication") }),
								j("option", { key: "workflow", value: "workflow", children: "⚙️ " + t("categoryWorkflow") }),
								j("option", { key: "safety", value: "safety", children: "🛡 " + t("categorySafety") }),
							],
						}),
					]}),
					// Tags
					js("div", { key: "tags", style: { marginBottom: "4px" }, children: [
						j("div", { style: { fontSize: "12px", fontWeight: 600, color: "var(--dsw-alias-label-primary)", marginBottom: "6px" }, children: t("tagsLabel") }),
						j("input", {
							type: "text",
							style: inputStyle,
							value: tagsStr,
							placeholder: t("tagsHint"),
							onChange: function(e) { setTagsStr(e.target.value); },
							disabled: saving,
						}),
						j("div", { style: { fontSize: "11px", color: "var(--dsw-alias-label-tertiary)", marginTop: "4px" }, children: t("tagsHint") }),
					]}),
					error ? j("div", { key: "err", style: { color: "var(--dsw-alias-label-error)", fontSize: "12px", marginTop: "10px" }, children: error }) : null,
				]})
			});
		}

		// ─── PromoteModal ─────────────────────────────────────────────────────
		function PromoteModal({ rule, onClose, t }) {
			var _useState = react.useState, useState = _useState[0], setState = _useState[1];
			var draftState = _useState(""), setDraft = draftState[1], draft = draftState[0];
			var loadingState = _useState(true), setLoading = loadingState[1], loading = loadingState[0];
			var errorState = _useState(null), setError = errorState[1], error = errorState[0];
			var copiedState = _useState(false), setCopied = copiedState[1], copied = copiedState[0];

			react.useEffect(function() {
				var cancelled = false;
				setLoading(true);
				fetch('/plugins/agent-evolve/api/rules/' + rule.id + '/promote', { method: 'POST' })
					.then(function(r) {
						if (!r.ok) throw new Error('HTTP ' + r.status);
						return r.json();
					})
					.then(function(data) {
						if (cancelled) return;
						setDraft(data.draft || data.agents_md || data.text || "");
						setLoading(false);
					})
					.catch(function(e) {
						if (cancelled) return;
						setError((e && e.message) || t("promoteError"));
						setLoading(false);
					});
				return function() { cancelled = true; };
			}, [rule.id]);

			function onCopy() {
				if (!draft) return;
				var done = function() {
					setCopied(true);
					setTimeout(function() { setCopied(false); }, 2000);
				};
				if (navigator.clipboard && navigator.clipboard.writeText) {
					navigator.clipboard.writeText(draft).then(done).catch(function() {
						fallbackCopy(draft);
						done();
					});
				} else {
					fallbackCopy(draft);
					done();
				}
			}

			function fallbackCopy(text) {
				try {
					var ta = document.createElement("textarea");
					ta.value = text;
					ta.style.position = "fixed";
					ta.style.left = "-9999px";
					document.body.appendChild(ta);
					ta.select();
					document.execCommand("copy");
					document.body.removeChild(ta);
				} catch (e) {}
			}

			return j(Modal, {
				title: "⭐ " + t("promoteRule"),
				onClose: onClose,
				width: "600px",
				footer: js("div", { children: [
					j("button", {
						key: "close",
						style: btnOutline,
						onClick: onClose,
						children: t("cancel"),
					}),
					j("button", {
						key: "copy",
						style: Object.assign({}, btnPrimary, {
							opacity: loading || !draft ? 0.5 : 1,
							background: copied ? "var(--dsw-alias-state-success-primary)" : "var(--dsw-alias-button-primary-fill)",
						}),
						disabled: loading || !draft,
						onClick: onCopy,
						children: copied ? "✓ " + t("copied") : "📋 " + t("copy"),
					}),
				]}),
				children: js("div", { children: [
					j("div", { key: "hint", style: { fontSize: "12px", color: "var(--dsw-alias-label-tertiary)", marginBottom: "10px" }, children: t("promoteHint") }),
					loading
						? js("div", { key: "ld", style: { textAlign: "center", padding: "40px 0" }, children: [
							j(SkeletonCard, { key: "sk", count: 1 }),
							j("div", { key: "txt", style: { marginTop: "12px", fontSize: "12px", color: "var(--dsw-alias-label-tertiary)" }, children: t("promoteLoading") }),
						]})
						: error
							? js("div", { key: "err", style: { textAlign: "center", padding: "30px 0" }, children: [
								j("div", { style: { color: "var(--dsw-alias-label-error)", marginBottom: "12px", fontSize: "13px" }, children: t("promoteError") + (error ? " (" + error + ")" : "") }),
							]})
							: js("div", { key: "ok", children: [
								j("div", { key: "label", style: { fontSize: "12px", fontWeight: 600, color: "var(--dsw-alias-label-primary)", marginBottom: "6px" }, children: t("promoteDraft") }),
								j("pre", { key: "code", style: codeBlockStyle, children: draft }),
								copied ? j("div", { key: "tip", style: { marginTop: "10px", fontSize: "12px", color: "var(--dsw-alias-state-success-primary)" }, children: "✓ " + t("copyHint") }) : null,
							]}),
				]})
			});
		}

		// ─── RulesTab ─────────────────────────────────────────────────────────
		function RulesTab({ t, badges, setBadges, onJumpToCorrection }) {
			var _useState = react.useState, useState = _useState[0], setState = _useState[1];
			var _useEffect = react.useEffect;
			var pendingState = _useState([]), setPending = pendingState[1], pending = pendingState[0];
			var approvedState = _useState([]), setApproved = approvedState[1], approved = approvedState[0];
			var loadingState = _useState(true), setLoading = loadingState[1], loading = loadingState[0];
			var errorState = _useState(null), setError = errorState[1], error = errorState[0];
			var busyIdState = _useState(null), setBusyId = busyIdState[1], busyId = busyIdState[0];
			var editingRuleState = _useState(null), setEditingRule = editingRuleState[1], editingRule = editingRuleState[0];
			var promotingRuleState = _useState(null), setPromotingRule = promotingRuleState[1], promotingRule = promotingRuleState[0];

			function refreshBadges() {
				fetch('/plugins/agent-evolve/api/stats')
					.then(function(r) { return r.json(); })
					.then(function(data) {
						if (setBadges) {
							setBadges(function(prev) {
								return Object.assign({}, prev, { rules: data.rules_proposed || 0 });
							});
						}
					})
					.catch(function() {});
			}

			function loadRules() {
				setLoading(true);
				setError(null);
				Promise.all([
					fetch('/plugins/agent-evolve/api/rules?status=proposed').then(function(r) {
						if (!r.ok) throw new Error('HTTP ' + r.status);
						return r.json();
					}),
					fetch('/plugins/agent-evolve/api/rules?status=approved').then(function(r) {
						if (!r.ok) throw new Error('HTTP ' + r.status);
						return r.json();
					}),
				])
				.then(function(results) {
					var pendingData = results[0];
					var approvedData = results[1];
					setPending(Array.isArray(pendingData) ? pendingData : (pendingData.rules || pendingData.items || []));
					setApproved(Array.isArray(approvedData) ? approvedData : (approvedData.rules || approvedData.items || []));
					setLoading(false);
				})
				.catch(function(e) {
					setError((e && e.message) || t("loadFailed"));
					setLoading(false);
				});
			}

			_useEffect(function() { loadRules(); }, []);

			function handleApprove(rule) {
				setBusyId(rule.id);
				fetch('/plugins/agent-evolve/api/rules/' + rule.id + '/approve', { method: 'POST' })
					.then(function(r) {
						if (!r.ok) throw new Error('HTTP ' + r.status);
						return r.json();
					})
					.then(function() {
						loadRules();
						refreshBadges();
					})
					.catch(function() { setBusyId(null); })
					.then(function() { setBusyId(null); });
			}

			function handleReject(rule) {
				if (typeof window !== "undefined" && window.confirm && !window.confirm(t("rejectConfirm"))) {
					return;
				}
				setBusyId(rule.id);
				fetch('/plugins/agent-evolve/api/rules/' + rule.id + '/reject', { method: 'POST' })
					.then(function(r) {
						if (!r.ok) throw new Error('HTTP ' + r.status);
						return r.json();
					})
					.then(function() {
						loadRules();
						refreshBadges();
					})
					.catch(function() { setBusyId(null); })
					.then(function() { setBusyId(null); });
			}

			function handleEdit(rule) {
				setEditingRule(rule);
			}

			function handleSaveEdit(patch) {
				if (!editingRule) return Promise.reject(new Error("no rule"));
				return fetch('/plugins/agent-evolve/api/rules/' + editingRule.id, {
					method: 'PUT',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify(patch),
				})
				.then(function(r) {
					if (!r.ok) throw new Error('HTTP ' + r.status);
					return r.json();
				})
				.then(function() {
					setEditingRule(null);
					loadRules();
					refreshBadges();
				});
			}

			function handlePromote(rule) {
				setPromotingRule(rule);
			}

			function renderSectionHeader(label, count) {
				return js("div", {
					style: {
						display: "flex",
						alignItems: "center",
						gap: "8px",
						margin: "6px 0 10px",
					},
					children: [
						j("span", { key: "l", style: { fontSize: "13px", fontWeight: 600, color: "var(--dsw-alias-label-primary)" }, children: label }),
						j("span", { key: "c", style: {
							fontSize: "11px",
							padding: "1px 8px",
							borderRadius: "10px",
							background: "var(--dsw-alias-bg-layer-1)",
							color: "var(--dsw-alias-label-tertiary)",
							border: "1px solid var(--dsw-alias-border-l2)",
						}, children: count }),
					],
				});
			}

			function renderEmpty(text) {
				return j("div", {
					style: {
						textAlign: "center",
						padding: "32px 20px",
						color: "var(--dsw-alias-label-tertiary)",
						fontSize: "13px",
						background: "var(--dsw-alias-bg-layer-2)",
						border: "1px dashed var(--dsw-alias-border-l2)",
						borderRadius: "12px",
						marginBottom: "10px",
					},
					children: text,
				});
			}

			if (loading) {
				return js("div", { children: [
					renderSectionHeader(t("rulePending"), "…"),
					j(SkeletonCard, { key: "sk1", count: 2 }),
					j("div", { key: "div", style: { height: "1px", background: "var(--dsw-alias-border-l2)", margin: "16px 0" } }),
					renderSectionHeader(t("ruleApproved"), "…"),
					j(SkeletonCard, { key: "sk2", count: 2 }),
				]});
			}

			if (error) {
				return js("div", { style: { textAlign: "center", padding: "40px 20px" }, children: [
					j("div", { style: { color: "var(--dsw-alias-label-error)", marginBottom: "12px", fontSize: "14px" }, children: t("loadFailed") + " (" + error + ")" }),
					j("button", { onClick: loadRules, style: btnPrimary, children: t("retry") }),
				]});
			}

			return js("div", { children: [
				// Pending section
				renderSectionHeader(t("rulePending"), pending.length),
				pending.length === 0
					? renderEmpty(t("emptyRules"))
					: pending.map(function(rule) {
						return j(RuleCard, {
							key: rule.id,
							rule: rule,
							kind: "pending",
							t: t,
							busy: busyId === rule.id,
							onApprove: handleApprove,
							onReject: handleReject,
							onEdit: handleEdit,
							onPromote: handlePromote,
							onJumpToCorrection: onJumpToCorrection,
						});
					}),
				// Divider
				j("div", { style: { height: "1px", background: "var(--dsw-alias-border-l2)", margin: "20px 0 16px" } }),
				// Approved section
				renderSectionHeader(t("ruleApproved"), approved.length),
				approved.length === 0
					? renderEmpty(t("emptyApproved"))
					: approved.map(function(rule) {
						return j(RuleCard, {
							key: rule.id,
							rule: rule,
							kind: "approved",
							t: t,
							busy: busyId === rule.id,
							onApprove: handleApprove,
							onReject: handleReject,
							onEdit: handleEdit,
							onPromote: handlePromote,
							onJumpToCorrection: onJumpToCorrection,
						});
					}),
				// Modals
				editingRule ? j(EditModal, {
					key: "edit",
					rule: editingRule,
					onSave: handleSaveEdit,
					onClose: function() { setEditingRule(null); },
					t: t,
				}) : null,
				promotingRule ? j(PromoteModal, {
					key: "promote",
					rule: promotingRule,
					onClose: function() { setPromotingRule(null); },
					t: t,
				}) : null,
			]});
		}

		// ─── MemoryCard ───────────────────────────────────────────────────────
		function MemoryCard({ memory, t, onArchive, onDelete, busy }) {
			var typeMeta = memoryTypeMeta[memory.type] || { icon: "⚪", labelKey: null, fg: "#94a3b8", bg: "rgba(148,163,184,0.12)", border: "rgba(148,163,184,0.35)" };
			var originMeta = memoryOriginMeta[memory.origin] || { icon: "⚪", labelKey: null };
			var isArchived = memory.status === "archived";
			var isSuperseded = memory.status === "superseded";
			var tags = [];
			try { tags = Array.isArray(memory.tags) ? memory.tags : JSON.parse(memory.tags || "[]"); } catch (e) { tags = []; }
			var weightPct = Math.round((memory.weight || 0) * 100);

			return js("div", {
				style: Object.assign({}, cardStyle, {
					padding: "14px 18px",
					marginBottom: "10px",
					opacity: isArchived ? 0.6 : 1,
				}),
				children: [
					// Top: type badge + status
					js("div", { key: "top", style: { display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap", marginBottom: "8px" }, children: [
						j("span", {
							key: "type",
							style: {
								display: "inline-flex", alignItems: "center", gap: "4px",
								padding: "2px 8px", borderRadius: "6px",
								background: typeMeta.bg, color: typeMeta.fg,
								border: "1px solid " + typeMeta.border,
								fontSize: "11px", fontWeight: 500,
							},
							children: [typeMeta.icon + " ", typeMeta.labelKey ? t(typeMeta.labelKey) : memory.type],
						}),
						isArchived ? j("span", { key: "st-arch", style: { fontSize: "11px", padding: "2px 8px", borderRadius: "6px", background: "var(--dsw-alias-bg-layer-1)", color: "var(--dsw-alias-label-tertiary)", border: "1px solid var(--dsw-alias-border-l2)" }, children: t("memStatusArchived") }) : null,
						isSuperseded ? j("span", { key: "st-sup", style: { fontSize: "11px", padding: "2px 8px", borderRadius: "6px", background: "var(--dsw-alias-bg-layer-1)", color: "var(--dsw-alias-label-tertiary)", border: "1px solid var(--dsw-alias-border-l2)" }, children: t("memStatusSuperseded") }) : null,
					]}),
					// Content
					j("div", {
						key: "content",
						style: {
							fontSize: "13px", lineHeight: 1.55,
							color: "var(--dsw-alias-label-primary)",
							padding: "4px 0", wordBreak: "break-word",
							whiteSpace: "pre-wrap",
						},
						children: memory.content || "",
					}),
					// Meta: weight + origin + access_count
					js("div", { key: "meta", style: { display: "flex", alignItems: "center", gap: "12px", fontSize: "11px", color: "var(--dsw-alias-label-tertiary)", marginTop: "10px", flexWrap: "wrap" }, children: [
						// Weight bar
						js("div", { key: "w", style: { display: "flex", alignItems: "center", gap: "6px", minWidth: "120px" }, children: [
							j("span", { key: "wl", children: t("memWeight") + ":" }),
							j("div", { key: "wt", style: progressTrackStyle, children: j("div", { style: progressFillStyle(memory.weight || 0) }) }),
							j("span", { key: "wv", style: { color: "var(--dsw-alias-label-secondary)", minWidth: "32px", textAlign: "right" }, children: weightPct + "%" }),
						]}),
						// Origin
						originMeta.labelKey ? js("span", { key: "o", style: { display: "inline-flex", alignItems: "center", gap: "3px" }, children: [originMeta.icon + " ", t(originMeta.labelKey)] }) : null,
						// Access count
						js("span", { key: "a", children: [t("memAccess") + ": ", j("b", { style: { color: "var(--dsw-alias-label-secondary)" }, children: memory.access_count || 0 })] }),
					]}),
					// Tags
					tags.length > 0 ? js("div", { key: "tags", style: { marginTop: "8px", display: "flex", flexWrap: "wrap" }, children: tags.map(function(tag, i) { return j(TagPill, { key: "tag-" + i, tag: tag }); }) }) : null,
					// Actions
					!isArchived ? js("div", { key: "act", style: { display: "flex", justifyContent: "flex-end", gap: "8px", marginTop: "10px" }, children: [
						j("button", {
							key: "del",
							style: Object.assign({}, btnDanger, { height: "28px", fontSize: "12px", opacity: busy ? 0.5 : 1 }),
							disabled: busy,
							onClick: function() { onDelete(memory); },
							children: t("memDelete"),
						}),
						j("button", {
							key: "arc",
							style: Object.assign({}, btnOutline, { height: "28px", fontSize: "12px", opacity: busy ? 0.5 : 1 }),
							disabled: busy,
							onClick: function() { onArchive(memory); },
							children: t("memArchive"),
						}),
					]}) : null,
				]
			});
		}

		// ─── MemoriesTab ─────────────────────────────────────────────────────
		function MemoriesTab({ t, badges, setBadges, activeTab }) {
			var _useState = react.useState, useState = _useState[0], setState = _useState[1];
			var _useEffect = react.useEffect;

			var memoriesState = _useState([]), setMemories = memoriesState[1], memories = memoriesState[0];
			var loadingState = _useState(true), setLoading = loadingState[1], loading = loadingState[0];
			var errorState = _useState(null), setError = errorState[1], error = errorState[0];
			var statusFilterState = _useState("all"), setStatusFilter = statusFilterState[1], statusFilter = statusFilterState[0];
			var typeFilterState = _useState("all"), setTypeFilter = typeFilterState[1], typeFilter = typeFilterState[0];
			var searchInputState = _useState(""), setSearchInput = searchInputState[1], searchInput = searchInputState[0];
			var activeSearchState = _useState(""), setActiveSearch = activeSearchState[1], activeSearch = activeSearchState[0];
			var busyIdState = _useState(null), setBusyId = busyIdState[1], busyId = busyIdState[0];
			var searchModeState = _useState(false), setSearchMode = searchModeState[1], searchMode = searchModeState[0];

			// Status options
			var statusOptions = [
				{ key: "all", label: t("filterAll") },
				{ key: "active", label: t("memStatusActive") },
				{ key: "superseded", label: t("memStatusSuperseded") },
				{ key: "archived", label: t("memStatusArchived") },
			];
			var typeOptions = [
				{ key: "all", label: t("filterAll") },
				{ key: "preference", label: t("memTypePreference") },
				{ key: "fact", label: t("memTypeFact") },
				{ key: "decision", label: t("memTypeDecision") },
				{ key: "skill", label: t("memTypeSkill") },
			];

			// Debounce search input → activeSearch (300ms)
			_useEffect(function() {
				if (searchInput === activeSearch) return;
				var timer = setTimeout(function() {
					setActiveSearch(searchInput.trim());
				}, 300);
				return function() { clearTimeout(timer); };
			}, [searchInput]);

			function refreshBadges() {
				fetch('/plugins/agent-evolve/api/memories?status=active')
					.then(function(r) { return r.json(); })
					.then(function(data) {
						var arr = Array.isArray(data) ? data : (data.items || data.memories || []);
						if (setBadges) {
							setBadges(function(prev) {
								return Object.assign({}, prev, { memories: arr.length });
							});
						}
					})
					.catch(function() {});
			}

			function loadMemories() {
				setLoading(true);
				setError(null);
				var url;
				if (activeSearch) {
					setSearchMode(true);
					url = '/plugins/agent-evolve/api/memories/search?q=' + encodeURIComponent(activeSearch);
				} else {
					setSearchMode(false);
					url = '/plugins/agent-evolve/api/memories';
					var qs = [];
					if (statusFilter && statusFilter !== "all") qs.push("status=" + encodeURIComponent(statusFilter));
					if (typeFilter && typeFilter !== "all") qs.push("type=" + encodeURIComponent(typeFilter));
					if (qs.length > 0) url += "?" + qs.join("&");
				}
				fetch(url)
					.then(function(r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
					.then(function(data) {
						setMemories(Array.isArray(data) ? data : (data.items || data.memories || []));
						setLoading(false);
					})
					.catch(function(e) {
						setError((e && e.message) || t("loadFailed"));
						setLoading(false);
					});
			}

			// Refetch when filters / active search change
			_useEffect(function() { loadMemories(); }, [statusFilter, typeFilter, activeSearch]);

			// Refresh badges on mount + after operations
			_useEffect(function() { refreshBadges(); }, []);

			// M3: explicit re-fetch when this Tab is re-activated.
			// The parent remounts this component via conditional
			// rendering, but defence-in-depth: if the rendering
			// pattern ever changes, this keeps the refresh behaviour.
			// Skip the initial mount (already handled above).
			var memActiveMountedRef = react.useRef(false);
			_useEffect(function() {
				if (!memActiveMountedRef.current) {
					memActiveMountedRef.current = true;
					return;
				}
				if (activeTab === "memories") {
					loadMemories();
					refreshBadges();
				}
				// eslint-disable-next-line react-hooks/exhaustive-deps
			}, [activeTab]);

			function onSearchKey(e) {
				if (e.key === "Enter") {
					setActiveSearch(searchInput.trim());
				}
			}

			function clearSearch() {
				setSearchInput("");
				setActiveSearch("");
			}

			function doArchive(memory) {
				if (typeof window !== "undefined" && window.confirm && !window.confirm(t("memArchiveConfirm"))) {
					return;
				}
				setBusyId(memory.id);
				fetch('/plugins/agent-evolve/api/memories/' + encodeURIComponent(memory.id) + '/archive', { method: 'POST' })
					.then(function(r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
					.then(function() {
						setBusyId(null);
						loadMemories();
						refreshBadges();
					})
					.catch(function() { setBusyId(null); });
			}

			function doDelete(memory) {
				if (typeof window !== "undefined" && window.confirm && !window.confirm(t("memDeleteConfirm"))) {
					return;
				}
				setBusyId(memory.id);
				fetch('/plugins/agent-evolve/api/memories/' + encodeURIComponent(memory.id), { method: 'DELETE' })
					.then(function(r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
					.then(function() {
						setBusyId(null);
						loadMemories();
						refreshBadges();
					})
					.catch(function() { setBusyId(null); });
			}

			function renderFilterBar() {
				return js("div", { style: { display: "flex", gap: "8px", marginBottom: "14px", flexWrap: "wrap", alignItems: "center" }, children: [
					// Status select
					js("div", { key: "st", style: { display: "flex", alignItems: "center", gap: "4px" }, children: [
						j("select", {
							key: "ss",
							value: statusFilter,
							onChange: function(e) { setStatusFilter(e.target.value); },
							style: Object.assign({}, selectStyle, { width: "auto", minWidth: "110px", height: "32px", fontSize: "13px" }),
							disabled: !!activeSearch,
							children: statusOptions.map(function(o) { return j("option", { key: o.key, value: o.key, children: o.label }); }),
						}),
					]}),
					// Type select
					js("div", { key: "ty", style: { display: "flex", alignItems: "center", gap: "4px" }, children: [
						j("select", {
							key: "ts",
							value: typeFilter,
							onChange: function(e) { setTypeFilter(e.target.value); },
							style: Object.assign({}, selectStyle, { width: "auto", minWidth: "110px", height: "32px", fontSize: "13px" }),
							disabled: !!activeSearch,
							children: typeOptions.map(function(o) { return j("option", { key: o.key, value: o.key, children: o.label }); }),
						}),
					]}),
					// Search input
					js("div", { key: "sr", style: { flex: 1, minWidth: "200px", display: "flex", alignItems: "center", gap: "6px", position: "relative" }, children: [
						j("input", {
							key: "si",
							type: "text",
							value: searchInput,
							placeholder: t("memSearchPlaceholder"),
							onChange: function(e) { setSearchInput(e.target.value); },
							onKeyDown: onSearchKey,
							style: Object.assign({}, inputStyle, { height: "32px", fontSize: "13px", paddingRight: searchInput ? "28px" : "12px" }),
						}),
						searchInput ? j("button", {
							key: "sc",
							onClick: clearSearch,
							style: {
								position: "absolute", right: "6px", top: "50%",
								transform: "translateY(-50%)",
								background: "transparent", border: "none",
								color: "var(--dsw-alias-label-tertiary)",
								fontSize: "14px", cursor: "pointer",
								padding: "0 4px", lineHeight: 1,
							},
							"aria-label": "clear",
							children: "×",
						}) : null,
					]}),
				]});
			}

			function renderEmpty(text) {
				return j("div", {
					style: {
						textAlign: "center",
						padding: "32px 20px",
						color: "var(--dsw-alias-label-tertiary)",
						fontSize: "13px",
						background: "var(--dsw-alias-bg-layer-2)",
						border: "1px dashed var(--dsw-alias-border-l2)",
						borderRadius: "12px",
						marginBottom: "10px",
					},
					children: text,
				});
			}

			if (loading) return js("div", { children: [
				renderFilterBar(),
				j(SkeletonCard, { key: "sk", count: 3 }),
			]});

			if (error) return js("div", { style: { textAlign: "center", padding: "40px 20px" }, children: [
				renderFilterBar(),
				j("div", { style: { color: "var(--dsw-alias-label-error)", marginBottom: "12px", fontSize: "14px" }, children: t("loadFailed") + " (" + error + ")" }),
				j("button", { onClick: loadMemories, style: btnPrimary, children: t("retry") }),
			]});

			return js("div", { children: [
				renderFilterBar(),
				searchMode ? js("div", { key: "hint", style: { fontSize: "11px", color: "var(--dsw-alias-label-tertiary)", marginBottom: "10px" }, children: "🔍 " + activeSearch }) : null,
				memories.length === 0
					? renderEmpty(searchMode ? t("memNoResults") : t("emptyMemories"))
					: memories.map(function(m) {
						return j(MemoryCard, {
							key: m.id,
							memory: m,
							t: t,
							busy: busyId === m.id,
							onArchive: doArchive,
							onDelete: doDelete,
						});
					}),
			]});
		}

		// ─── PersonaEditModal ─────────────────────────────────────────────────
		function PersonaEditModal({ dimKey, initialValue, onSave, onClose, t }) {
			var _useState = react.useState;
			var valueState = _useState(initialValue || ""), setValue = valueState[1], value = valueState[0];
			var savingState = _useState(false), setSaving = savingState[1], saving = savingState[0];
			var errorState = _useState(null), setError = errorState[1], error = errorState[0];

			function onSaveClick() {
				setError(null);
				setSaving(true);
				Promise.resolve(onSave(value))
					.catch(function(e) {
						setError((e && e.message) || t("operationFailed", { msg: "unknown" }));
					})
					.then(function() { setSaving(false); });
			}

			var dimMeta = personaDimMeta[dimKey] || { icon: "⚪", labelKey: null };
			var titleText = "✏️ " + (dimMeta.labelKey ? t(dimMeta.labelKey) : dimKey);

			return j(Modal, {
				title: titleText,
				onClose: saving ? function() {} : onClose,
				footer: js("div", { children: [
					j("button", { key: "cancel", style: btnOutline, disabled: saving, onClick: onClose, children: t("cancel") }),
					j("button", { key: "save", style: Object.assign({}, btnPrimary, { opacity: saving ? 0.6 : 1 }), disabled: saving, onClick: onSaveClick, children: saving ? t("saving") : t("save") }),
				]}),
				children: js("div", { children: [
					js("div", { key: "lbl", style: { fontSize: "12px", fontWeight: 600, color: "var(--dsw-alias-label-primary)", marginBottom: "6px" }, children: t("personaValueLabel") }),
					j("textarea", {
						key: "ta",
						style: Object.assign({}, textareaStyle, { minHeight: "160px" }),
						value: value,
						placeholder: t("personaValuePlaceholder"),
						onChange: function(e) { setValue(e.target.value); },
						disabled: saving,
					}),
					error ? j("div", { key: "err", style: { color: "var(--dsw-alias-label-error)", fontSize: "12px", marginTop: "10px" }, children: error }) : null,
				]}),
			});
		}

		// ─── PersonaTab ──────────────────────────────────────────────────────
		function PersonaTab({ t, badges, setBadges, activeTab }) {
			var _useState = react.useState, useState = _useState[0], setState = _useState[1];
			var _useEffect = react.useEffect;

			var personaState = _useState({}), setPersona = personaState[1], persona = personaState[0];
			var loadingState = _useState(true), setLoading = loadingState[1], loading = loadingState[0];
			var errorState = _useState(null), setError = errorState[1], error = errorState[0];
			var rebuildingState = _useState(false), setRebuilding = rebuildingState[1], rebuilding = rebuildingState[0];
			var editingState = _useState(null), setEditing = editingState[1], editing = editingState[0];

			// The four canonical dimensions (always rendered, even if empty)
			var dimKeys = ["tech_stack", "coding_style", "communication", "common_tasks"];

			function normalizePersona(raw) {
				// Accept either { key: {value, confidence, updated_at} } or [{ key, value, ... }]
				if (Array.isArray(raw)) {
					var obj = {};
					raw.forEach(function(item) {
						if (item && item.key) obj[item.key] = item;
					});
					return obj;
				}
				if (raw && typeof raw === "object") {
					var out = {};
					dimKeys.forEach(function(k) {
						if (raw[k]) out[k] = Object.assign({ key: k }, raw[k]);
						else if (raw[k] !== undefined) out[k] = { key: k, value: String(raw[k]) };
					});
					// Also keep any extra keys the backend returned
					Object.keys(raw).forEach(function(k) {
						if (!out[k] && raw[k] && typeof raw[k] === "object") {
							out[k] = Object.assign({ key: k }, raw[k]);
						}
					});
					return out;
				}
				return {};
			}

			function refreshBadges(p) {
				var filled = 0;
				dimKeys.forEach(function(k) {
					var entry = p[k];
					if (entry && entry.value && String(entry.value).trim().length > 0) filled++;
				});
				if (setBadges) {
					setBadges(function(prev) {
						return Object.assign({}, prev, { persona: filled });
					});
				}
			}

			function loadPersona() {
				setLoading(true);
				setError(null);
				fetch('/plugins/agent-evolve/api/persona')
					.then(function(r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
					.then(function(data) {
						var p = normalizePersona(data);
						setPersona(p);
						setLoading(false);
						refreshBadges(p);
					})
					.catch(function(e) {
						setError((e && e.message) || t("loadFailed"));
						setLoading(false);
					});
			}

			_useEffect(function() { loadPersona(); }, []);

			// M3: explicit re-fetch when this Tab is re-activated
			// (defence-in-depth — see MemoriesTab for rationale).
			var personaActiveMountedRef = react.useRef(false);
			_useEffect(function() {
				if (!personaActiveMountedRef.current) {
					personaActiveMountedRef.current = true;
					return;
				}
				if (activeTab === "persona") loadPersona();
				// eslint-disable-next-line react-hooks/exhaustive-deps
			}, [activeTab]);

			function doSaveEdit(dimKey, newValue) {
				return fetch('/plugins/agent-evolve/api/persona/' + encodeURIComponent(dimKey), {
					method: 'PUT',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ value: newValue }),
				})
				.then(function(r) {
					if (!r.ok) throw new Error('HTTP ' + r.status);
					return r.json();
				})
				.then(function() {
					setEditing(null);
					loadPersona();
				});
			}

			function doRebuild() {
				setRebuilding(true);
				fetch('/plugins/agent-evolve/api/persona/rebuild', { method: 'POST' })
					.then(function(r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
					.then(function() {
						setRebuilding(false);
						loadPersona();
					})
					.catch(function() { setRebuilding(false); });
			}

			function renderHeader() {
				var lastUpdatedTs = null;
				dimKeys.forEach(function(k) {
					var entry = persona[k];
					if (entry && entry.updated_at) {
						var ts = typeof entry.updated_at === "number" ? entry.updated_at : Date.parse(entry.updated_at);
						if (ts && (!lastUpdatedTs || ts > lastUpdatedTs)) lastUpdatedTs = ts;
					}
				});
				var updatedTxt = lastUpdatedTs ? relativeTime(lastUpdatedTs, t) : t("never");
				return js("div", { style: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: "10px", marginBottom: "14px", flexWrap: "wrap" }, children: [
					js("div", { key: "info", style: { display: "flex", alignItems: "center", gap: "8px", fontSize: "12px", color: "var(--dsw-alias-label-tertiary)" }, children: [
						j("span", { key: "u", children: [t("personaLastUpdated") + ": ", j("b", { style: { color: "var(--dsw-alias-label-secondary)" }, children: updatedTxt })] }),
					]}),
					j("button", {
						key: "rb",
						onClick: doRebuild,
						disabled: rebuilding,
						style: Object.assign({}, btnPrimary, {
							opacity: rebuilding ? 0.6 : 1,
							background: rebuilding ? "var(--dsw-alias-bg-skeleton)" : "var(--dsw-alias-button-primary-fill)",
							color: rebuilding ? "var(--dsw-alias-label-tertiary)" : "var(--dsw-alias-label-primary-foreground)",
						}),
						children: rebuilding ? ("⏳ " + t("personaRebuilding")) : ("🔄 " + t("personaRebuild")),
					}),
				]});
			}

			function renderDimCard(dimKey) {
				var meta = personaDimMeta[dimKey] || { icon: "⚪", labelKey: null };
				var entry = persona[dimKey] || {};
				var value = entry.value || "";
				var confidence = typeof entry.confidence === "number" ? entry.confidence : 0;
				var isEmpty = !value || String(value).trim().length === 0;

				return js("div", { style: Object.assign({}, cardStyle, { padding: "14px 18px", marginBottom: "10px" }), children: [
					// Title row
					js("div", { key: "title", style: { display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "10px", gap: "8px" }, children: [
						js("div", { key: "l", style: { display: "flex", alignItems: "center", gap: "6px" }, children: [
							j("span", { key: "i", style: { fontSize: "16px" }, children: meta.icon }),
							j("span", { key: "t", style: { fontSize: "14px", fontWeight: 600, color: "var(--dsw-alias-label-primary)" }, children: meta.labelKey ? t(meta.labelKey) : dimKey }),
						]}),
						j("button", {
							key: "e",
							style: Object.assign({}, btnOutline, { height: "28px", fontSize: "12px" }),
							onClick: function() { setEditing({ key: dimKey, value: value }); },
							children: t("edit"),
						}),
					]}),
					// Value
					isEmpty
						? j("div", { key: "v", style: { fontSize: "12px", color: "var(--dsw-alias-label-tertiary)", fontStyle: "italic", padding: "8px 0" }, children: t("personaEmpty") })
						: j("div", { key: "v", style: { fontSize: "13px", color: "var(--dsw-alias-label-secondary)", lineHeight: 1.55, padding: "6px 0", whiteSpace: "pre-wrap", wordBreak: "break-word" }, children: value }),
					// Confidence row
					js("div", { key: "conf", style: { display: "flex", alignItems: "center", gap: "8px", marginTop: "10px", fontSize: "11px", color: "var(--dsw-alias-label-tertiary)" }, children: [
						j("span", { key: "l", children: t("personaConfidence") + ":" }),
						j("div", { key: "t", style: progressTrackStyle, children: j("div", { style: progressFillStyle(confidence, confidence >= 0.7 ? "var(--dsw-alias-state-success-primary)" : confidence >= 0.4 ? "var(--dsw-alias-accent)" : "var(--dsw-alias-label-tertiary)") }) }),
						j("span", { key: "v", style: { color: "var(--dsw-alias-label-secondary)", minWidth: "36px", textAlign: "right" }, children: Math.round(confidence * 100) + "%" }),
					]}),
				]});
			}

			function isAllEmpty() {
				return dimKeys.every(function(k) {
					var entry = persona[k];
					return !entry || !entry.value || String(entry.value).trim().length === 0;
				});
			}

			if (loading) return js("div", { children: [
				renderHeader(),
				j(SkeletonCard, { key: "sk", count: 2 }),
			]});

			if (error) return js("div", { style: { textAlign: "center", padding: "40px 20px" }, children: [
				renderHeader(),
				j("div", { style: { color: "var(--dsw-alias-label-error)", marginBottom: "12px", fontSize: "14px" }, children: t("loadFailed") + " (" + error + ")" }),
				j("button", { onClick: loadPersona, style: btnPrimary, children: t("retry") }),
			]});

			return js("div", { children: [
				renderHeader(),
				isAllEmpty() ? js("div", { key: "empty", style: { textAlign: "center", padding: "20px", color: "var(--dsw-alias-label-tertiary)", fontSize: "13px", marginBottom: "10px" }, children: t("personaEmptyHint") }) : null,
				dimKeys.map(function(k) { return renderDimCard(k); }),
				editing ? j(PersonaEditModal, {
					key: "em",
					dimKey: editing.key,
					initialValue: editing.value,
					onSave: function(v) { return doSaveEdit(editing.key, v); },
					onClose: function() { setEditing(null); },
					t: t,
				}) : null,
			]});
		}

		// ─── BottomStatsBar ───────────────────────────────────────────────────
		// M3: stats are now driven by the parent (AgentEvolveSettingsTab),
		// which fetches on mount + every 30s + on Tab switch + after config
		// save. We no longer fetch here — keeping a local copy would race
		// the parent and waste a request. The defensive `stats || {}` covers
		// the brief window before the parent's first response lands.
		function BottomStatsBar({ stats, t, enabled }) {
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
			var badgesState = _useState({ lessons: 0, rules: 0, memories: 0, persona: 0 }), setBadges = badgesState[1], badges = badgesState[0];
			var statsState = _useState(null), setStats = statsState[1], stats = statsState[0];
			var highlightIdState = _useState(null), setHighlightId = highlightIdState[1], highlightId = highlightIdState[0];

			// ── M3: config draft state (bound to inputs in the expanded
			//    config section). Loaded from /api/config on first open.
			//    Has sensible defaults so a fresh install renders.
			var configDraftState = _useState(null), setConfigDraft = configDraftState[1], configDraft = configDraftState[0];
			var savingConfigState = _useState(false), setSavingConfig = savingConfigState[1], savingConfig = savingConfigState[0];
			var saveMsgState = _useState(null), setSaveMsg = saveMsgState[1], saveMsg = saveMsgState[0];
			var testingEmbeddingState = _useState(false), setTestingEmbedding = testingEmbeddingState[1], testingEmbedding = testingEmbeddingState[0];
			var embeddingStatusState = _useState(null), setEmbeddingStatus = embeddingStatusState[1], embeddingStatus = embeddingStatusState[0];
			var embeddingProbeAtState = _useState(null), setEmbeddingProbeAt = embeddingProbeAtState[1], embeddingProbeAt = embeddingProbeAtState[0];

			// Defensive default so the config inputs render even before the
			// first /api/config response lands.
			function ensureDraft() {
				if (configDraft) return configDraft;
				return {
					enabled: enabled,
					batchSize: 3,
					ruleThreshold: 5,
					ruleTokenBudget: 800,
					llmTimeoutMs: 30000,
					personaEverySessions: 50,
					personaEveryMs: 7 * 24 * 60 * 60 * 1000,
					model: '',
					signalWordsText: '',
					embedding: {
						autoDetect: true,
						ollamaBaseUrl: 'http://127.0.0.1:11434',
						preferredModel: 'bge-m3',
						timeoutMs: 1000,
					},
				};
			}

			// ── Centralised stats + badges refresh. Used on mount,
			//    30-second timer, Tab switch, and after config save.
			function refreshStatsAndBadges() {
				fetch('/plugins/agent-evolve/api/stats')
					.then(function(r) { return r.json(); })
					.then(function(data) {
						if (!data || typeof data !== 'object') return;
						setStats(data);
						setBadges(function(prev) {
							return Object.assign({}, prev, {
								lessons: data.corrections_pending || 0,
								rules: data.rules_proposed || 0,
								// M3: badge = active memories, not total
								memories: data.memories_active || 0,
							});
						});
					})
					.catch(function() {});
			}

			// Load initial config + stats on mount
			_useEffect(function() {
				fetch('/plugins/agent-evolve/api/config')
					.then(function(r) { return r.json(); })
					.then(function(data) {
						if (data && data.enabled !== undefined) setEnabled(data.enabled);
						if (data && data.embeddingStatus) {
							setEmbeddingStatus(data.embeddingStatus);
							setEmbeddingProbeAt(Date.now());
						}
					})
					.catch(function() {});
				refreshStatsAndBadges();
			}, []);

			// ── M3: refresh stats every 30s. Single interval shared
			//    across the component lifetime (cleaned on unmount).
			_useEffect(function() {
				var id = setInterval(refreshStatsAndBadges, 30000);
				return function() { clearInterval(id); };
			}, []);

			// ── M3: refresh stats when user switches Tab. Skips the
			//    initial mount (handled by the mount effect above) but
			//    fires for any subsequent change.
			var firstTabChangeRef = react.useRef(true);
			_useEffect(function() {
				if (firstTabChangeRef.current) {
					firstTabChangeRef.current = false;
					return;
				}
				refreshStatsAndBadges();
			}, [activeTab]);

			// ── M3: when configOpen flips true (and only the first
			//    time), populate the form draft from /api/config. Saves
			//    a round-trip when the user never expands the section.
			var configLoadedRef = react.useRef(false);
			_useEffect(function() {
				if (!configOpen) return;
				if (configLoadedRef.current) return;
				configLoadedRef.current = true;
				fetch('/plugins/agent-evolve/api/config')
					.then(function(r) { return r.json(); })
					.then(function(data) {
						if (!data || typeof data !== 'object') return;
						setConfigDraft({
							enabled: data.enabled !== false,
							batchSize: Number.isFinite(data.batchSize) ? data.batchSize : 3,
							ruleThreshold: Number.isFinite(data.ruleThreshold) ? data.ruleThreshold : 5,
							ruleTokenBudget: Number.isFinite(data.ruleTokenBudget) ? data.ruleTokenBudget : 800,
							llmTimeoutMs: Number.isFinite(data.llmTimeoutMs) ? data.llmTimeoutMs : 30000,
							personaEverySessions: Number.isFinite(data.personaEverySessions) ? data.personaEverySessions : 50,
							personaEveryMs: Number.isFinite(data.personaEveryMs) ? data.personaEveryMs : 7 * 24 * 60 * 60 * 1000,
							model: typeof data.model === 'string' ? data.model : '',
							signalWordsText: Array.isArray(data.signalWords) ? data.signalWords.join(', ') : '',
							embedding: Object.assign({
								autoDetect: true,
								ollamaBaseUrl: 'http://127.0.0.1:11434',
								preferredModel: 'bge-m3',
								timeoutMs: 1000,
							}, data.embedding || {}),
						});
						if (data.embeddingStatus) {
							setEmbeddingStatus(data.embeddingStatus);
							setEmbeddingProbeAt(Date.now());
						}
					})
					.catch(function() {});
			}, [configOpen]);

			function toggleEnabled() {
				var next = !enabled;
				setEnabled(next);
				fetch('/plugins/agent-evolve/api/config', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ enabled: next }),
				}).catch(function() {});
			}

			function updateDraft(patch) {
				setConfigDraft(function(prev) {
					var base = ensureDraft();
					return Object.assign({}, base, patch);
				});
			}

			function updateDraftEmbedding(patch) {
				setConfigDraft(function(prev) {
					var base = ensureDraft();
					var emb = Object.assign({}, base.embedding || {}, patch);
					return Object.assign({}, base, { embedding: emb });
				});
			}

			// ── Save handler: POST the draft to /api/config, refresh
			//    stats + badges + embedding status on success.
			function saveConfig() {
				var draft = ensureDraft();
				setSavingConfig(true);
				setSaveMsg(null);
				var payload = {
					enabled: draft.enabled !== false,
					batchSize: Number(draft.batchSize) || 3,
					ruleThreshold: Number(draft.ruleThreshold) || 5,
					ruleTokenBudget: Number(draft.ruleTokenBudget) || 800,
					llmTimeoutMs: Number(draft.llmTimeoutMs) || 30000,
					personaEverySessions: Number(draft.personaEverySessions) || 50,
					personaEveryMs: Number(draft.personaEveryMs) || (7 * 24 * 60 * 60 * 1000),
					model: draft.model || '',
					// textarea → array split. The backend normalises
					// either shape; sending a string keeps client-side
					// parsing minimal.
					signalWords: draft.signalWordsText || '',
					embedding: {
						autoDetect: draft.embedding && draft.embedding.autoDetect !== false,
						ollamaBaseUrl: (draft.embedding && draft.embedding.ollamaBaseUrl) || 'http://127.0.0.1:11434',
						preferredModel: (draft.embedding && draft.embedding.preferredModel) || 'bge-m3',
						timeoutMs: Number(draft.embedding && draft.embedding.timeoutMs) || 1000,
					},
				};
				fetch('/plugins/agent-evolve/api/config', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify(payload),
				})
				.then(function(r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
				.then(function(data) {
					setSavingConfig(false);
					setSaveMsg({ ok: true, text: t("saveSuccess") });
					if (data && data.embeddingStatus) {
						setEmbeddingStatus(data.embeddingStatus);
						setEmbeddingProbeAt(Date.now());
					}
					refreshStatsAndBadges();
					setTimeout(function() { setSaveMsg(null); }, 2500);
				})
				.catch(function(e) {
					setSavingConfig(false);
					setSaveMsg({ ok: false, text: t("saveFailed") + (e && e.message ? (' (' + e.message + ')') : '') });
				});
			}

			// ── Test embedding connection: sends a sentinel that the
			//    backend strips + acts on (re-probes Ollama). Result is
			//    returned in the same response envelope.
			function testEmbedding() {
				setTestingEmbedding(true);
				fetch('/plugins/agent-evolve/api/config', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ __testEmbedding: true }),
				})
				.then(function(r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
				.then(function(data) {
					setTestingEmbedding(false);
					if (data && data.embeddingStatus) {
						setEmbeddingStatus(data.embeddingStatus);
						setEmbeddingProbeAt(Date.now());
						setSaveMsg({
							ok: data.embeddingStatus.mode === 'enabled',
							text: data.embeddingStatus.mode === 'enabled' ? t("embeddingTestOk") : t("embeddingTestFail"),
						});
					}
					setTimeout(function() { setSaveMsg(null); }, 2500);
				})
				.catch(function(e) {
					setTestingEmbedding(false);
					setSaveMsg({ ok: false, text: t("embeddingTestFail") + (e && e.message ? (' (' + e.message + ')') : '') });
				});
			}

			// ── M3: human-readable embedding status text. Drives the
			//    line at the bottom of the config card.
			function renderEmbeddingStatus() {
				var st = embeddingStatus;
				if (!st) {
					return t("embeddingProbeAt") + ": —";
				}
				var label;
				if (st.mode === 'enabled') {
					label = (st.model || 'embedding') + " " + t("embeddingEnabled");
				} else if (st.mode === 'keyword') {
					label = t("embeddingKeyword");
				} else {
					label = t("embeddingDisabled");
				}
				var probeTxt = embeddingProbeAt
					? " (" + t("embeddingProbeAt") + ": " + relativeTime(embeddingProbeAt, t) + ")"
					: '';
				return label + probeTxt;
			}

			var tabs = [
				{ id: "lessons", label: t("tabLessons"), badge: badges.lessons },
				{ id: "rules", label: t("tabRules"), badge: badges.rules },
				{ id: "memories", label: t("tabMemories"), badge: badges.memories },
				{ id: "persona", label: t("tabPersona"), badge: badges.persona },
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
					// Advanced config (inline expand) — M3: bound to configDraft
					// state, populated from /api/config on first open.
					configOpen ? (function() {
						var draft = ensureDraft();
						var embedding = draft.embedding || {};
						var embStatusColor = embeddingStatus && embeddingStatus.mode === 'enabled'
							? "var(--dsw-alias-state-success-primary)"
							: embeddingStatus && embeddingStatus.mode === 'keyword'
								? "var(--dsw-alias-accent)"
								: "var(--dsw-alias-label-tertiary)";
						var statusLineColor = saveMsg
							? (saveMsg.ok ? "var(--dsw-alias-state-success-primary)" : "var(--dsw-alias-label-error)")
							: embStatusColor;
						return j("div", { style: { padding: "12px 0 4px" }, children:
							js("div", { style: { ...cardStyle, padding: "16px 20px" }, children: [
								// Row 1: numeric knobs (batch size, threshold,
								// LLM timeout, persona frequency)
								js("div", { style: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }, children: [
									// Batch size
									js("div", { children: [
										j("div", { style: labelStyle, children: t("batchSize") }),
										j("input", {
											type: "number", min: 1, max: 100, style: inputStyle,
											value: draft.batchSize,
											onChange: function(e) { updateDraft({ batchSize: Number(e.target.value) }); },
										}),
									]}),
									// Promote threshold
									js("div", { children: [
										j("div", { style: labelStyle, children: t("promoteThreshold") }),
										j("input", {
											type: "number", min: 1, max: 100, style: inputStyle,
											value: draft.ruleThreshold,
											onChange: function(e) { updateDraft({ ruleThreshold: Number(e.target.value) }); },
										}),
									]}),
									// LLM timeout (ms)
									js("div", { children: [
										j("div", { style: labelStyle, children: t("llmTimeout") + " (" + t("llmTimeoutUnit") + ")" }),
										j("input", {
											type: "number", min: 1000, step: 1000, style: inputStyle,
											value: draft.llmTimeoutMs,
											onChange: function(e) { updateDraft({ llmTimeoutMs: Number(e.target.value) }); },
										}),
									]}),
									// Model selection
									js("div", { children: [
										j("div", { style: labelStyle, children: t("modelSelect") }),
										j("input", {
											type: "text", placeholder: t("modelFollowCurrent"),
											style: inputStyle,
											value: draft.model || '',
											onChange: function(e) { updateDraft({ model: e.target.value }); },
										}),
									]}),
								]}),
								// Row 2: persona cadence (sessions + ms)
								js("div", { style: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginTop: "12px" }, children: [
									js("div", { children: [
										j("div", { style: labelStyle, children: t("personaFreqSessions") }),
										j("input", {
											type: "number", min: 1, max: 10000, style: inputStyle,
											value: draft.personaEverySessions,
											onChange: function(e) { updateDraft({ personaEverySessions: Number(e.target.value) }); },
										}),
									]}),
									js("div", { children: [
										j("div", { style: labelStyle, children: t("personaFreqDays") }),
										j("input", {
											type: "number", min: 1, max: 365, style: inputStyle,
											// Display in days for human-friendliness,
											// store as ms in state.
											value: Math.round(draft.personaEveryMs / 86400000),
											onChange: function(e) {
												var days = Math.max(1, Number(e.target.value) || 1);
												updateDraft({ personaEveryMs: days * 86400000 });
											},
										}),
									]}),
								]}),
								// Row 3: signal words editor (comma-separated)
								js("div", { style: { marginTop: "12px" }, children: [
									j("div", { style: labelStyle, children: t("correctionSignals") }),
									j("textarea", {
										rows: 2,
										placeholder: t("signalWordsPlaceholder"),
										style: Object.assign({}, inputStyle, { height: "auto", padding: "8px 12px", resize: "vertical", fontFamily: "inherit" }),
										value: draft.signalWordsText || '',
										onChange: function(e) { updateDraft({ signalWordsText: e.target.value }); },
									}),
									j("div", { style: { fontSize: "11px", color: "var(--dsw-alias-label-tertiary)", marginTop: "2px" }, children: t("signalWordsHint") }),
								]}),
								// Row 4: embedding subsection
								js("div", { style: { marginTop: "12px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }, children: [
									// Auto-detect toggle
									js("div", { children: [
										j("div", { style: labelStyle, children: t("embedding") }),
										j("select", {
											style: selectStyle,
											value: embedding.autoDetect === false ? "none" : "auto",
											onChange: function(e) {
												updateDraftEmbedding({ autoDetect: e.target.value !== "none" });
											},
											children: [
												j("option", { value: "auto", children: t("embeddingAuto") }),
												j("option", { value: "none", children: t("embeddingNone") }),
											],
										}),
									]}),
									// Embedding model name
									js("div", { children: [
										j("div", { style: labelStyle, children: t("embeddingModelLabel") }),
										j("input", {
											type: "text", style: inputStyle,
											value: embedding.preferredModel || 'bge-m3',
											onChange: function(e) { updateDraftEmbedding({ preferredModel: e.target.value }); },
										}),
									]}),
									// Ollama base URL
									js("div", { style: { gridColumn: "1 / span 2" }, children: [
										j("div", { style: labelStyle, children: t("embeddingBaseUrlLabel") }),
										j("input", {
											type: "text", style: inputStyle,
											value: embedding.ollamaBaseUrl || 'http://127.0.0.1:11434',
											onChange: function(e) { updateDraftEmbedding({ ollamaBaseUrl: e.target.value }); },
										}),
									]}),
									// Timeout (ms)
									js("div", { children: [
										j("div", { style: labelStyle, children: t("embeddingTimeoutLabel") + " (" + t("llmTimeoutUnit") + ")" }),
										j("input", {
											type: "number", min: 100, step: 100, style: inputStyle,
											value: embedding.timeoutMs || 1000,
											onChange: function(e) { updateDraftEmbedding({ timeoutMs: Number(e.target.value) }); },
										}),
									]}),
									// Test connection button (right-aligned)
									js("div", { style: { display: "flex", alignItems: "flex-end" }, children: [
										j("button", {
											style: Object.assign({}, btnOutline, { height: "36px", fontSize: "12px", opacity: testingEmbedding ? 0.6 : 1 }),
											disabled: testingEmbedding,
											onClick: testEmbedding,
											children: testingEmbedding ? t("embeddingTesting") : t("embeddingTest"),
										}),
									]}),
								]}),
								// Embedding status / save message line
								js("div", { style: { marginTop: "10px", fontSize: "12px", color: statusLineColor, display: "flex", justifyContent: "space-between", alignItems: "center", gap: "8px", flexWrap: "wrap" }, children: [
									j("span", { style: { flex: 1 }, children: [
										saveMsg ? saveMsg.text : ([
											t("embeddingStatus"), "：",
											j("span", { style: { color: embStatusColor, fontWeight: 500 }, children: renderEmbeddingStatus() }),
										]),
									]}),
									// Save button
									j("button", {
										style: Object.assign({}, btnPrimary, { height: "30px", fontSize: "12px", opacity: savingConfig ? 0.6 : 1 }),
										disabled: savingConfig,
										onClick: saveConfig,
										children: savingConfig ? t("savingConfig") : t("saveConfig"),
									}),
								]}),
							]})
						});
					})() : null,
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
					children: activeTab === "lessons" ? j(CorrectionsTab, {
						t: t,
						badges: badges,
						setBadges: setBadges,
						highlightId: highlightId,
						onClearHighlight: function() { setHighlightId(null); },
					}) :
						activeTab === "rules" ? j(RulesTab, {
							t: t,
							badges: badges,
							setBadges: setBadges,
							onJumpToCorrection: function(cid) {
								setActiveTab("lessons");
								setHighlightId(cid);
							},
						}) :
						activeTab === "memories" ? j(MemoriesTab, {
							t: t,
							badges: badges,
							setBadges: setBadges,
							// M3: pass activeTab so the Tab can refresh
							// explicitly when activated (defensive — the
							// conditional rendering already remounts, but
							// this lets future refactors keep behaviour
							// stable).
							activeTab: activeTab,
						}) :
						j(PersonaTab, {
							t: t,
							badges: badges,
							setBadges: setBadges,
							activeTab: activeTab,
						}),
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
