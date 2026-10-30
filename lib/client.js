// dsh-session-title-regen — client half (hand-written ModuleLoader factory,
// same shape as dsh-free-search's lib/client.js: only react + react/jsx-runtime
// are required; all styling is self-hosted CSS).
//
// Injects one row into the session row "..." menu (slot
// sidebar.workspaces.session.menu.item, order 500 → after Copy Session ID) and
// one shell.overlay dialog. Clicking the row POSTs to the node bridge route,
// the dialog shows the candidate title (editable, with the model that produced
// it), and Apply commits through sessions.using(...).binding.session.rename —
// exactly the built-in rename path, so the sidebar row updates via projection.
window.__ModuleLoader__.load({
  id: "dsh-session-title-regen",
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;

    let react = require("react");
    let react_jsx_runtime = require("react/jsx-runtime");

    //#region css
    const css = [
      ".dshstr-menuitem{display:block;width:100%;text-align:left;font:inherit;font-size:13px;line-height:1.4;color:inherit;background:0 0;border:0;border-top:1px solid rgba(0,0,0,.08);border-radius:0;padding:7px 12px;margin-top:4px;cursor:pointer;transition:background 120ms ease}",
      ".dshstr-menuitem:hover{background:rgba(0,0,0,.06)}",
      "@media (prefers-color-scheme: dark){.dshstr-menuitem{border-top-color:rgba(255,255,255,.1)}.dshstr-menuitem:hover{background:rgba(255,255,255,.08)}}",
      ".dshstr-backdrop{position:fixed;inset:0;z-index:2147483000;background:rgba(0,0,0,.35);display:flex;align-items:center;justify-content:center;padding:24px}",
      ".dshstr-modal{width:440px;max-width:100%;display:flex;flex-direction:column;gap:14px;box-sizing:border-box;padding:22px;border-radius:14px;background:#ffffff;border:1px solid rgba(0,0,0,.08);color:#1d1d1f;box-shadow:0 24px 60px rgba(0,0,0,.25);font-family:-apple-system,\"SF Pro Text\",\"PingFang SC\",\"Segoe UI\",system-ui,sans-serif}",
      "@media (prefers-color-scheme: dark){.dshstr-modal{background:#1e1f24;border-color:rgba(255,255,255,.1);color:#f5f5f7}}",
      ".dshstr-title{font-size:15px;font-weight:600}",
      ".dshstr-status{display:flex;align-items:center;gap:10px;font-size:13px;color:#6e6e73;min-height:40px}",
      "@media (prefers-color-scheme: dark){.dshstr-status{color:#a1a1a6}}",
      ".dshstr-spinner{flex:none;width:16px;height:16px;border-radius:50%;border:2px solid rgba(0,113,227,.25);border-top-color:#0071e3;animation:dshstrSpin .8s linear infinite}",
      "@keyframes dshstrSpin{to{transform:rotate(360deg)}}",
      ".dshstr-model{font-size:12px;color:#6e6e73;font-variant-numeric:tabular-nums}",
      "@media (prefers-color-scheme: dark){.dshstr-model{color:#a1a1a6}}",
      ".dshstr-field{display:flex;flex-direction:column;gap:6px}",
      ".dshstr-label{font-size:13px;font-weight:500}",
      ".dshstr-input{font:inherit;font-size:14px;color:inherit;background:rgba(0,0,0,.03);border:1px solid rgba(0,0,0,.12);border-radius:10px;padding:9px 12px;width:100%;box-sizing:border-box}",
      ".dshstr-input:focus-visible{outline:none;border-color:#0071e3;box-shadow:0 0 0 3px rgba(0,113,227,.25)}",
      "@media (prefers-color-scheme: dark){.dshstr-input{background:rgba(255,255,255,.05);border-color:rgba(255,255,255,.12)}.dshstr-input:focus-visible{border-color:#0a84ff;box-shadow:0 0 0 3px rgba(10,132,255,.25)}}",
      ".dshstr-hint{font-size:12px;color:#6e6e73}",
      "@media (prefers-color-scheme: dark){.dshstr-hint{color:#a1a1a6}}",
      ".dshstr-error{font-size:13px;color:#ff3b30;line-height:1.5;word-break:break-word}",
      "@media (prefers-color-scheme: dark){.dshstr-error{color:#ff453a}}",
      ".dshstr-footer{display:flex;justify-content:flex-end;align-items:center;gap:10px;flex-wrap:wrap;padding-top:2px}",
      ".dshstr-btn{font:inherit;font-size:13px;font-weight:500;color:inherit;background:rgba(0,0,0,.05);border:1px solid rgba(0,0,0,.08);border-radius:9px;padding:7px 14px;cursor:pointer;transition:background 120ms ease}",
      ".dshstr-btn:hover:not(:disabled){background:rgba(0,0,0,.09)}",
      ".dshstr-btn:disabled{opacity:.5;cursor:default}",
      "@media (prefers-color-scheme: dark){.dshstr-btn{background:rgba(255,255,255,.08);border-color:rgba(255,255,255,.1)}.dshstr-btn:hover:not(:disabled){background:rgba(255,255,255,.14)}}",
      ".dshstr-primary{color:#ffffff;background:#0071e3;border-color:#0071e3}",
      ".dshstr-primary:hover:not(:disabled){background:#0077ed}",
      "@media (prefers-color-scheme: dark){.dshstr-primary{background:#0a84ff;border-color:#0a84ff}.dshstr-primary:hover:not(:disabled){background:#2a95ff}}"
    ].join("");
    const tagId = "dsh-session-title-regen/client.css";
    if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId) + "]") === null) {
      const tag = document.createElement("style");
      tag.dataset.plugin = "dsh-session-title-regen";
      tag.dataset.pluginCss = tagId;
      tag.textContent = css;
      document.head.appendChild(tag);
    }
    //#endregion

    const BRIDGE_PREFIX = "/api/dsh-session-title-regen";
    const NS = "dsh-session-title-regen";
    const DICTS = {
      zh: {
        item: "AI 重新生成标题",
        dialog: "AI 重新生成标题",
        generating: "正在用会话最近使用的模型生成标题…",
        model: "模型：{provider} / {model}",
        field: "新标题",
        hint: "可先编辑，再应用到会话",
        failed: "生成失败",
        apply: "应用",
        applying: "应用中…",
        cancel: "取消",
        retry: "重试",
        again: "重新生成",
      },
      en: {
        item: "AI regenerate title",
        dialog: "AI Regenerate Title",
        generating: "Generating a title with the model this session last used…",
        model: "Model: {provider} / {model}",
        field: "New title",
        hint: "Edit before applying if needed",
        failed: "Generation failed",
        apply: "Apply",
        applying: "Applying…",
        cancel: "Cancel",
        retry: "Retry",
        again: "Regenerate",
      },
    };

    // Module-scoped request store shared by the menu row (requester) and the
    // overlay dialog (renderer): null = closed.
    let request = null;
    const listeners = new Set();
    function publish(next) {
      request = next;
      for (const listener of listeners) listener();
    }
    function useRequest() {
      return react.useSyncExternalStore(
        (callback) => {
          listeners.add(callback);
          return () => listeners.delete(callback);
        },
        () => request,
        () => request,
      );
    }

    function RegenRow({ sessionId, displayTitle, useMenuOpenState, requestRegenerate, t }) {
      const [, setMenuOpen] = useMenuOpenState();
      return react_jsx_runtime.jsx("button", {
        role: "menuitem",
        className: "dshstr-menuitem",
        onClick: () => {
          setMenuOpen(false);
          requestRegenerate(sessionId, displayTitle);
        },
        children: t("item"),
      });
    }

    function RegenDialog({ useRequest, generate, commit, close, t }) {
      const current = useRequest();
      const [draft, setDraft] = react.useState("");
      const [commitError, setCommitError] = react.useState(null);
      const [applying, setApplying] = react.useState(false);
      const sessionId = current === null ? "" : current.sessionId;
      const phase = current === null ? "" : current.phase;
      const title = current === null ? "" : current.title;
      react.useEffect(() => {
        setDraft(phase === "ready" ? title : "");
        setCommitError(null);
        setApplying(false);
      }, [sessionId, phase, title]);
      react.useEffect(() => {
        const onKey = (event) => {
          if (event.key === "Escape") close();
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
      }, [close]);
      if (current === null) return null;
      const onApply = async () => {
        const trimmed = draft.trim();
        if (trimmed.length === 0 || applying) return;
        setApplying(true);
        setCommitError(null);
        try {
          await commit(current.sessionId, trimmed);
        } catch (error) {
          setCommitError(error instanceof Error ? error.message : String(error));
          setApplying(false);
        }
      };
      const onApplyKey = (event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          void onApply();
        }
      };
      return react_jsx_runtime.jsx("div", {
        className: "dshstr-backdrop",
        onMouseDown: (event) => {
          if (event.target === event.currentTarget && !applying) close();
        },
        children: react_jsx_runtime.jsxs("div", {
          className: "dshstr-modal",
          role: "dialog",
          "aria-modal": "true",
          "aria-label": t("dialog"),
          children: [
            react_jsx_runtime.jsx("div", { className: "dshstr-title", children: t("dialog") }),
            current.phase === "generating"
              ? react_jsx_runtime.jsxs("div", { className: "dshstr-status", children: [
                  react_jsx_runtime.jsx("span", { className: "dshstr-spinner" }),
                  t("generating"),
                ] })
              : null,
            current.phase === "ready" && current.model
              ? react_jsx_runtime.jsx("div", { className: "dshstr-model", children: t("model", { provider: current.model.provider, model: current.model.model }) })
              : null,
            current.phase !== "generating"
              ? react_jsx_runtime.jsxs("label", { className: "dshstr-field", children: [
                  react_jsx_runtime.jsx("span", { className: "dshstr-label", children: t("field") }),
                  react_jsx_runtime.jsx("input", {
                    className: "dshstr-input",
                    value: draft,
                    autoFocus: current.phase === "ready",
                    disabled: applying,
                    onChange: (event) => setDraft(event.target.value),
                    onKeyDown: onApplyKey,
                  }),
                  react_jsx_runtime.jsx("span", { className: "dshstr-hint", children: t("hint") }),
                ] })
              : null,
            current.phase === "error" || commitError !== null
              ? react_jsx_runtime.jsx("div", { className: "dshstr-error", children: current.phase === "error" ? t("failed") + ": " + current.error : commitError })
              : null,
            react_jsx_runtime.jsxs("div", { className: "dshstr-footer", children: [
              current.phase === "error"
                ? react_jsx_runtime.jsx("button", { className: "dshstr-btn", onClick: () => generate(current.sessionId, current.currentTitle), children: t("retry") })
                : null,
              current.phase === "ready"
                ? react_jsx_runtime.jsx("button", { className: "dshstr-btn", disabled: applying, onClick: () => generate(current.sessionId, current.currentTitle), children: t("again") })
                : null,
              react_jsx_runtime.jsx("button", { className: "dshstr-btn", disabled: applying, onClick: () => close(), children: t("cancel") }),
              react_jsx_runtime.jsx("button", { className: "dshstr-btn dshstr-primary", disabled: current.phase !== "ready" || applying || draft.trim().length === 0, onClick: () => void onApply(), children: applying ? t("applying") : t("apply") }),
            ] }),
          ],
        }),
      });
    }

    const inject = ["slots", "locale", "sessions"];

    function apply(ctx) {
      ctx.effect(() => ctx.locale.register(NS, DICTS), "dsh-session-title-regen: dictionaries");

      const generate = async (sessionId, currentTitle) => {
        publish({ sessionId, currentTitle, phase: "generating", title: "", error: null, model: null });
        try {
          const response = await fetch(BRIDGE_PREFIX + "/generate", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ sessionId, currentTitle }),
          });
          let data = null;
          try {
            data = await response.json();
          } catch {}
          if (data !== null && data.ok === true && typeof data.title === "string" && data.title.length > 0) {
            publish({ sessionId, currentTitle, phase: "ready", title: data.title, error: null, model: data.model ?? null });
          } else {
            const message = (data !== null && (data.message || data.code)) || ("HTTP " + response.status);
            publish({ sessionId, currentTitle, phase: "error", title: "", error: String(message), model: null });
          }
        } catch (error) {
          publish({ sessionId, currentTitle, phase: "error", title: "", error: error instanceof Error ? error.message : String(error), model: null });
        }
      };
      const requestRegenerate = (sessionId, currentTitle) => {
        void generate(sessionId, currentTitle);
      };
      const close = () => publish(null);
      const commit = async (sessionId, title) => {
        const result = await ctx.sessions.using(sessionId, { source: "workspaceOperation" }, (reference) => reference.binding.session.rename(title));
        if (!result.ok) throw new Error(result.error?.message ?? "rename failed");
        publish(null);
      };

      // Order 500 lands after the shipped Copy Session ID (450); the row's
      // border-top opens the plugin group like MenuItemButton's separatorBefore.
      ctx.slots.inject("sidebar.workspaces.session.menu.item", () =>
        ctx.slots.register(
          {
            name: "sidebar.workspaces.session.menu.item",
            id: "dsh-session-title-regen.item",
            order: 500,
            locale: NS,
            inject: () => ({ requestRegenerate }),
          },
          RegenRow,
        ),
      );
      ctx.slots.inject("shell.overlay", () =>
        ctx.slots.register(
          {
            name: "shell.overlay",
            id: "dsh-session-title-regen.dialog",
            locale: NS,
            inject: () => ({ useRequest, generate, commit, close }),
          },
          RegenDialog,
        ),
      );
    }

    exports.apply = apply;
    exports.inject = inject;
    return module.exports;
  },
});
