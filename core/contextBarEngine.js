// ==========================================
// Antigravity Context Bar UI Engine
// ==========================================
(function() {
  const electron_1 = require("electron");

  function getModelContextLimit(modelName) {
    if (!modelName) return 1048576;
    const lower = modelName.toLowerCase();
    if (lower.includes('claude')) return 200000;
    if (lower.includes('pro')) return 2097152;
    if (lower.includes('gpt-4') || lower.includes('o1') || lower.includes('o3')) return 128000;
    if (lower.includes('flash') || lower.includes('gemini')) return 1048576;
    return 1048576;
  }

  
  const isZh = (() => {
    try {
      if (typeof navigator !== 'undefined') {
        const l = (navigator.language || navigator.userLanguage || '').toLowerCase();
        if (l.startsWith('zh')) return true;
      }
      if (document.documentElement && document.documentElement.lang && document.documentElement.lang.startsWith('zh')) return true;
      if (document.querySelector('[aria-label="设置"]') || (document.title && /[\u4e00-\u9fa5]/.test(document.title))) return true;
    } catch (e) {}
    return false;
  })();

  const i18n = {
    topBarTitle: isZh ? '点击展开/固定上下文占用详情' : 'Click to inspect/pin context usage details',
    trackTitle: isZh ? '上下文实时各模块占用分布' : 'Real-time context breakdown by category',
    detailBtn: isZh ? '📊 详情' : '📊 Details',
    refreshTitle: isZh ? '立即重新统计' : 'Refresh stats now',
    popTitle: isZh ? '⚡ 上下文容量透视' : '⚡ Context Capacity Inspector',
    popCloseTitle: isZh ? '关闭详情' : 'Close details',
    toolsLabel: isZh ? '🛠️ 工具调用与终端输出' : '🛠️ Tool Calls & Output',
    modelLabel: isZh ? '🤖 智能体回复与方案' : '🤖 Agent Responses',
    thinkLabel: isZh ? '🧠 深度思考推理' : '🧠 Deep Thinking',
    userLabel: isZh ? '👤 用户指令与提问' : '👤 User Prompts',
    sysLabel: isZh ? '⚙️ 系统预设与规则' : '⚙️ System Rules',
    artLabel: isZh ? '📄 工件与关联文档' : '📄 Artifacts & Docs',
    toolsTitle: isZh ? '工具调用与输出' : 'Tool Calls & Output',
    modelTitle: isZh ? '智能体回复' : 'Agent Responses',
    thinkTitle: isZh ? '深度思考' : 'Deep Thinking',
    userTitle: isZh ? '用户输入' : 'User Prompts',
    sysTitle: isZh ? '系统规则' : 'System Rules',
    artTitle: isZh ? '关联文档' : 'Artifacts & Docs',
    pinBtn: isZh ? '📌 点击锁定' : '📌 Pin Card',
    pinnedBtn: isZh ? '📌 已锁定 (点击解锁)' : '📌 Pinned (Click to unpin)',
    healthGood: (avail) => isZh ? ('🟢 空间极其充裕 (' + avail + ' 可用)') : ('🟢 Abundant Space (' + avail + ' avail)'),
    healthMed: (avail) => isZh ? ('🟡 容量正常适中 (' + avail + ' 可用)') : ('🟡 Moderate Usage (' + avail + ' avail)'),
    healthWarn: isZh ? '🔴 接近上限建议开启新会话' : '🔴 Near Limit, Consider New Chat'
  };

  function formatTokens(count) {
    if (!count || count <= 0) return '0';
    if (count === 1048576) return '1.0M';
    if (count === 2097152) return '2.0M';
    if (count >= 1000000) return (count / 1000000).toFixed(2) + 'M';
    if (count >= 1000) return (count / 1000).toFixed(1) + 'k';
    return count.toLocaleString();
  }

  function injectStyles() {
    if (document.getElementById('antigravity-context-styles')) return;
    const style = document.createElement('style');
    style.id = 'antigravity-context-styles';
    style.textContent = `
      @keyframes agyBorderFlow {
        0% { background-position: 0% 50%; }
        50% { background-position: 100% 50%; }
        100% { background-position: 0% 50%; }
      }
      @keyframes agyShimmerSweep {
        0% { transform: translateX(-150%); }
        100% { transform: translateX(250%); }
      }
      @keyframes agyPulseGreen {
        0%, 100% { box-shadow: 0 0 6px #10b981; }
        50% { box-shadow: 0 0 15px #10b981, 0 0 22px rgba(16, 185, 129, 0.5); }
      }
      @keyframes agyPulseYellow {
        0%, 100% { box-shadow: 0 0 6px #f59e0b; }
        50% { box-shadow: 0 0 15px #f59e0b, 0 0 22px rgba(245, 158, 11, 0.5); }
      }
      @keyframes agyPulseRed {
        0%, 100% { box-shadow: 0 0 6px #ef4444; }
        50% { box-shadow: 0 0 15px #ef4444, 0 0 22px rgba(239, 68, 68, 0.5); }
      }
      @keyframes agySpin {
        from { transform: rotate(0deg); }
        to { transform: rotate(360deg); }
      }
      @keyframes agyFadeUp {
        from { opacity: 0; transform: translateY(6px) scale(0.98); }
        to { opacity: 1; transform: translateY(0) scale(1); }
      }

      /* 顶部横条状长容器：z-index 设为 30，确保模型切换等高层级下拉菜单（z-index: 50+）自然在其上层展示 */
      #agy-context-root {
        position: fixed;
        z-index: 30;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "PingFang SC", "Microsoft YaHei", sans-serif;
        user-select: none;
        box-sizing: border-box;
        opacity: 1;
        pointer-events: auto;
        transition: opacity 0.15s ease, width 0.15s ease, left 0.15s ease, bottom 0.15s ease;
      }

      /* 当输入 @ 或 / 呼出提示菜单时，状态栏彻底无感隐藏，避免任何遮挡 */
      #agy-context-root.agy-hidden {
        display: none !important;
        opacity: 0 !important;
        visibility: hidden !important;
        pointer-events: none !important;
      }

      .agy-top-bar {
        display: flex;
        align-items: center;
        gap: 12px;
        height: 32px;
        width: 100%;
        box-sizing: border-box;
        padding: 0 12px;
        background: rgba(18, 22, 34, 0.95);
        backdrop-filter: blur(20px);
        -webkit-backdrop-filter: blur(20px);
        border-radius: 10px;
        border: 1px solid rgba(255, 255, 255, 0.16);
        box-shadow: 0 6px 20px rgba(0, 0, 0, 0.45), 0 0 16px rgba(99, 102, 241, 0.22);
        cursor: pointer;
        position: relative;
        overflow: hidden;
        transition: all 0.22s cubic-bezier(0.16, 1, 0.3, 1);
      }

      .agy-top-bar:hover {
        background: rgba(24, 29, 46, 0.98);
        border-color: rgba(129, 140, 248, 0.65);
        box-shadow: 0 8px 30px rgba(0, 0, 0, 0.55), 0 0 24px rgba(129, 140, 248, 0.4);
      }

      /* 顶部横条流光动效边框 (Flowing Rainbow Border) */
      .agy-top-bar::before {
        content: '';
        position: absolute;
        inset: 0;
        border-radius: 10px;
        padding: 1.5px;
        background: linear-gradient(90deg, #00f2fe, #4facfe, #9333ea, #f43f5e, #38bdf8, #00f2fe);
        background-size: 300% 100%;
        animation: agyBorderFlow 5s linear infinite;
        -webkit-mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
        -webkit-mask-composite: xor;
        mask-composite: exclude;
        pointer-events: none;
      }

      /* 左侧状态与百分比 */
      .agy-bar-left {
        display: flex;
        align-items: center;
        gap: 7px;
        flex-shrink: 0;
      }

      .agy-dot {
        width: 7px;
        height: 7px;
        border-radius: 50%;
        background-color: #10b981;
        box-shadow: 0 0 8px #10b981;
        animation: agyPulseGreen 2s infinite ease-in-out;
        flex-shrink: 0;
      }
      .agy-dot.status-yellow {
        background-color: #f59e0b;
        box-shadow: 0 0 8px #f59e0b;
        animation: agyPulseYellow 2s infinite ease-in-out;
      }
      .agy-dot.status-red {
        background-color: #ef4444;
        box-shadow: 0 0 8px #ef4444;
        animation: agyPulseRed 2s infinite ease-in-out;
      }

      .agy-badge-text {
        font-size: 11px;
        font-weight: 700;
        letter-spacing: 0.5px;
        color: #94a3b8;
        text-transform: uppercase;
      }

      .agy-pct {
        font-size: 12px;
        font-weight: 800;
        background: linear-gradient(135deg, #38bdf8, #818cf8, #f43f5e);
        -webkit-background-clip: text;
        -webkit-text-fill-color: transparent;
        font-variant-numeric: tabular-nums;
        min-width: 38px;
      }

      /* 中间长条状流光进度条 (Stretching Progress Track) */
      .agy-progress-track {
        flex: 1;
        height: 7px;
        background: rgba(255, 255, 255, 0.08);
        border-radius: 999px;
        overflow: hidden;
        position: relative;
        display: flex;
        min-width: 100px;
      }

      .agy-progress-segment {
        height: 100%;
        transition: width 0.4s ease;
      }
      .agy-seg-tools { background: #38bdf8; }
      .agy-seg-model { background: #a855f7; }
      .agy-seg-think { background: #ec4899; }
      .agy-seg-user { background: #10b981; }
      .agy-seg-system { background: #f59e0b; }
      .agy-seg-artifacts { background: #eab308; }

      /* 流光掠影高光动效 (Shimmer Highlight Wave) */
      .agy-progress-shimmer {
        position: absolute;
        inset: 0;
        background: linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.7) 50%, transparent 100%);
        animation: agyShimmerSweep 2.2s infinite ease-in-out;
        pointer-events: none;
      }

      /* 右侧数值与按钮 */
      .agy-bar-right {
        display: flex;
        align-items: center;
        gap: 10px;
        flex-shrink: 0;
      }

      .agy-token-counts {
        font-size: 11px;
        color: #cbd5e1;
        font-variant-numeric: tabular-nums;
        display: flex;
        align-items: center;
        gap: 4px;
      }
      .agy-used-val {
        font-weight: 700;
        color: #f8fafc;
      }
      .agy-max-val {
        color: #64748b;
      }

      .agy-model-badge {
        font-size: 10px;
        padding: 2px 7px;
        border-radius: 6px;
        background: rgba(99, 102, 241, 0.22);
        color: #a5b4fc;
        border: 1px solid rgba(99, 102, 241, 0.45);
        font-weight: 600;
        max-width: 140px;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .agy-btn-detail {
        font-size: 11px;
        color: #cbd5e1;
        padding: 3px 8px;
        border-radius: 6px;
        background: rgba(255, 255, 255, 0.08);
        border: 1px solid rgba(255, 255, 255, 0.15);
        display: flex;
        align-items: center;
        gap: 3px;
        cursor: pointer;
        transition: all 0.15s ease;
      }
      .agy-btn-detail:hover {
        background: rgba(99, 102, 241, 0.3);
        border-color: rgba(129, 140, 248, 0.6);
        color: #fff;
      }

      .agy-refresh-btn {
        background: rgba(255, 255, 255, 0.08);
        border: 1px solid rgba(255, 255, 255, 0.15);
        color: #cbd5e1;
        padding: 3px 7px;
        border-radius: 6px;
        font-size: 11px;
        cursor: pointer;
        transition: all 0.15s ease;
        display: flex;
        align-items: center;
      }
      .agy-refresh-btn:hover {
        background: rgba(99, 102, 241, 0.3);
        border-color: rgba(129, 140, 248, 0.6);
        color: #fff;
      }
      .agy-refresh-icon.rotating {
        animation: agySpin 0.6s linear infinite;
      }

      /* 悬浮弹出容量透视面板 */
      #agy-context-popover {
        position: absolute;
        bottom: calc(100% + 8px);
        right: 0;
        width: 360px;
        max-width: min(360px, calc(100vw - 24px));
        box-sizing: border-box;
        background: rgba(16, 20, 32, 0.98);
        backdrop-filter: blur(24px);
        -webkit-backdrop-filter: blur(24px);
        border: 1px solid rgba(255, 255, 255, 0.18);
        border-radius: 16px;
        box-shadow: 0 20px 50px rgba(0, 0, 0, 0.7), 0 0 30px rgba(99, 102, 241, 0.3);
        padding: 14px 16px;
        display: none;
        flex-direction: column;
        gap: 12px;
        color: #f1f5f9;
        max-height: calc(100vh - 120px);
        overflow-y: auto;
        z-index: 1000000;
        animation: agyFadeUp 0.2s cubic-bezier(0.16, 1, 0.3, 1);
        cursor: default;
      }

      /* 窄屏自适应响应式 */
      @media (max-width: 480px) {
        .agy-model-badge { display: none !important; }
        .agy-top-bar { gap: 8px !important; padding: 0 8px !important; }
      }

      .agy-pop-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        border-bottom: 1px solid rgba(255, 255, 255, 0.08);
        padding-bottom: 8px;
      }
      .agy-pop-title {
        font-size: 13px;
        font-weight: 700;
        display: flex;
        align-items: center;
        gap: 6px;
        color: #f8fafc;
      }
      .agy-pop-actions {
        display: flex;
        align-items: center;
        gap: 8px;
      }
      .agy-pop-model {
        font-size: 11px;
        padding: 2px 7px;
        border-radius: 6px;
        background: rgba(99, 102, 241, 0.22);
        color: #a5b4fc;
        border: 1px solid rgba(99, 102, 241, 0.45);
        font-weight: 500;
      }
      .agy-pop-close {
        background: transparent;
        border: none;
        color: #94a3b8;
        font-size: 14px;
        cursor: pointer;
        padding: 2px 5px;
        border-radius: 4px;
        transition: color 0.15s ease;
      }
      .agy-pop-close:hover {
        color: #fff;
        background: rgba(255, 255, 255, 0.1);
      }

      .agy-pop-stats-grid {
        display: flex;
        flex-direction: column;
        gap: 9px;
      }
      .agy-stat-row {
        display: flex;
        flex-direction: column;
        gap: 3px;
      }
      .agy-stat-meta {
        display: flex;
        align-items: center;
        justify-content: space-between;
        font-size: 12px;
      }
      .agy-stat-label {
        display: flex;
        align-items: center;
        gap: 6px;
        color: #cbd5e1;
      }
      .agy-stat-color {
        width: 8px;
        height: 8px;
        border-radius: 50%;
        flex-shrink: 0;
      }
      .agy-stat-val {
        display: flex;
        align-items: center;
        gap: 6px;
        font-variant-numeric: tabular-nums;
      }
      .agy-stat-tokens {
        color: #f8fafc;
        font-weight: 600;
      }
      .agy-stat-pct {
        font-size: 11px;
        color: #64748b;
        width: 36px;
        text-align: right;
      }
      .agy-stat-mini-bar {
        height: 3px;
        width: 100%;
        background: rgba(255, 255, 255, 0.06);
        border-radius: 999px;
        overflow: hidden;
      }
      .agy-stat-mini-fill {
        height: 100%;
        border-radius: 999px;
        transition: width 0.3s ease;
      }
      .agy-pop-footer {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding-top: 8px;
        border-top: 1px solid rgba(255, 255, 255, 0.08);
        font-size: 11px;
        color: #94a3b8;
      }
      .agy-health-pill {
        padding: 2px 7px;
        border-radius: 999px;
        font-size: 10px;
        font-weight: 600;
        background: rgba(16, 185, 129, 0.15);
        color: #34d399;
        border: 1px solid rgba(16, 185, 129, 0.3);
      }
      .agy-pin-indicator {
        font-size: 11px;
        color: #818cf8;
        cursor: pointer;
        padding: 2px 6px;
        border-radius: 5px;
      }
      .agy-pin-indicator:hover {
        background: rgba(99, 102, 241, 0.2);
        color: #a5b4fc;
      }
    `;
    document.head.appendChild(style);
  }

  let rootEl = null;
  let popoverPinned = false;
  let currentConvoId = null;
  let documentClickBound = false;
  let rafPositionId = null;

  function schedulePositionWidget() {
    if (rafPositionId !== null) return;
    rafPositionId = requestAnimationFrame(() => {
      rafPositionId = null;
      positionWidget();
    });
  }

  function ensureWidget() {
    if (!document.body) return;
    injectStyles();

    if (!rootEl || !document.body.contains(rootEl)) {
      const existing = document.getElementById('agy-context-root');
      if (existing) existing.remove();

      rootEl = document.createElement('div');
      rootEl.id = 'agy-context-root';
      rootEl.innerHTML = `
        <div class="agy-top-bar" id="agy-top-bar" title="${i18n.topBarTitle}">
          <div class="agy-bar-left">
            <span class="agy-dot" id="agy-status-dot"></span>
            <span class="agy-badge-text">Context</span>
            <span class="agy-pct" id="agy-pct-val">0.0%</span>
          </div>

          <div class="agy-progress-track" id="agy-progress-track" title="${i18n.trackTitle}">
            <div class="agy-progress-segment agy-seg-tools" id="agy-seg-tools" style="width: 0%" title="${i18n.toolsTitle}"></div>
            <div class="agy-progress-segment agy-seg-model" id="agy-seg-model" style="width: 0%" title="${i18n.modelTitle}"></div>
            <div class="agy-progress-segment agy-seg-think" id="agy-seg-think" style="width: 0%" title="${i18n.thinkTitle}"></div>
            <div class="agy-progress-segment agy-seg-user" id="agy-seg-user" style="width: 0%" title="${i18n.userTitle}"></div>
            <div class="agy-progress-segment agy-seg-system" id="agy-seg-system" style="width: 0%" title="${i18n.sysTitle}"></div>
            <div class="agy-progress-segment agy-seg-artifacts" id="agy-seg-artifacts" style="width: 0%" title="${i18n.artTitle}"></div>
            <div class="agy-progress-shimmer"></div>
          </div>

          <div class="agy-bar-right">
            <div class="agy-token-counts">
              <span class="agy-used-val" id="agy-used-val">0</span>
              <span class="agy-max-val" id="agy-max-val">/ 1.0M</span>
            </div>
            <span class="agy-model-badge" id="agy-model-badge">Gemini 3.8 Flash</span>
            <span class="agy-btn-detail" id="agy-btn-detail">${i18n.detailBtn}</span>
            <button class="agy-refresh-btn" id="agy-refresh-btn" title="${i18n.refreshTitle}">
              <span class="agy-refresh-icon" id="agy-refresh-icon">🔄</span>
            </button>
          </div>
        </div>

        <div id="agy-context-popover">
          <div class="agy-pop-header">
            <div class="agy-pop-title">
              <span>${i18n.popTitle}</span>
            </div>
            <div class="agy-pop-actions">
              <span class="agy-pop-model" id="agy-pop-model-badge">Gemini 3.8 Flash</span>
              <button class="agy-pop-close" id="agy-pop-close" title="${i18n.popCloseTitle}">✕</button>
            </div>
          </div>

          <div class="agy-pop-stats-grid">
            <div class="agy-stat-row">
              <div class="agy-stat-meta">
                <span class="agy-stat-label"><span class="agy-stat-color" style="background:#38bdf8;"></span>${i18n.toolsLabel}</span>
                <span class="agy-stat-val"><span class="agy-stat-tokens" id="pop-tools-tok">0</span><span class="agy-stat-pct" id="pop-tools-pct">0%</span></span>
              </div>
              <div class="agy-stat-mini-bar"><div class="agy-stat-mini-fill" id="pop-tools-bar" style="background:#38bdf8; width:0%;"></div></div>
            </div>

            <div class="agy-stat-row">
              <div class="agy-stat-meta">
                <span class="agy-stat-label"><span class="agy-stat-color" style="background:#a855f7;"></span>${i18n.modelLabel}</span>
                <span class="agy-stat-val"><span class="agy-stat-tokens" id="pop-model-tok">0</span><span class="agy-stat-pct" id="pop-model-pct">0%</span></span>
              </div>
              <div class="agy-stat-mini-bar"><div class="agy-stat-mini-fill" id="pop-model-bar" style="background:#a855f7; width:0%;"></div></div>
            </div>

            <div class="agy-stat-row">
              <div class="agy-stat-meta">
                <span class="agy-stat-label"><span class="agy-stat-color" style="background:#ec4899;"></span>${i18n.thinkLabel}</span>
                <span class="agy-stat-val"><span class="agy-stat-tokens" id="pop-think-tok">0</span><span class="agy-stat-pct" id="pop-think-pct">0%</span></span>
              </div>
              <div class="agy-stat-mini-bar"><div class="agy-stat-mini-fill" id="pop-think-bar" style="background:#ec4899; width:0%;"></div></div>
            </div>

            <div class="agy-stat-row">
              <div class="agy-stat-meta">
                <span class="agy-stat-label"><span class="agy-stat-color" style="background:#10b981;"></span>${i18n.userLabel}</span>
                <span class="agy-stat-val"><span class="agy-stat-tokens" id="pop-user-tok">0</span><span class="agy-stat-pct" id="pop-user-pct">0%</span></span>
              </div>
              <div class="agy-stat-mini-bar"><div class="agy-stat-mini-fill" id="pop-user-bar" style="background:#10b981; width:0%;"></div></div>
            </div>

            <div class="agy-stat-row">
              <div class="agy-stat-meta">
                <span class="agy-stat-label"><span class="agy-stat-color" style="background:#f59e0b;"></span>${i18n.sysLabel}</span>
                <span class="agy-stat-val"><span class="agy-stat-tokens" id="pop-sys-tok">0</span><span class="agy-stat-pct" id="pop-sys-pct">0%</span></span>
              </div>
              <div class="agy-stat-mini-bar"><div class="agy-stat-mini-fill" id="pop-sys-bar" style="background:#f59e0b; width:0%;"></div></div>
            </div>

            <div class="agy-stat-row">
              <div class="agy-stat-meta">
                <span class="agy-stat-label"><span class="agy-stat-color" style="background:#eab308;"></span>${i18n.artLabel}</span>
                <span class="agy-stat-val"><span class="agy-stat-tokens" id="pop-art-tok">0</span><span class="agy-stat-pct" id="pop-art-pct">0%</span></span>
              </div>
              <div class="agy-stat-mini-bar"><div class="agy-stat-mini-fill" id="pop-art-bar" style="background:#eab308; width:0%;"></div></div>
            </div>
          </div>

          <div class="agy-pop-footer">
            <span class="agy-health-pill" id="agy-health-badge">${i18n.healthGood('1.0M')}</span>
            <span class="agy-pin-indicator" id="agy-pin-btn">${i18n.pinBtn}</span>
          </div>
        </div>
      `;

      document.body.appendChild(rootEl);

      const topBar = rootEl.querySelector('#agy-top-bar');
      const popover = rootEl.querySelector('#agy-context-popover');
      const btnDetail = rootEl.querySelector('#agy-btn-detail');
      const refreshBtn = rootEl.querySelector('#agy-refresh-btn');
      const refreshIcon = rootEl.querySelector('#agy-refresh-icon');
      const pinBtn = rootEl.querySelector('#agy-pin-btn');
      const closeBtn = rootEl.querySelector('#agy-pop-close');

      const showPopover = () => {
        popover.style.display = 'flex';
        rootEl.style.zIndex = '50';
        try {
          const pRect = popover.getBoundingClientRect();
          if (pRect.left < 10) {
            popover.style.right = 'auto';
            popover.style.left = '0';
          } else {
            popover.style.right = '0';
            popover.style.left = 'auto';
          }
        } catch (e) {}
      };

      const hidePopover = () => {
        if (!popoverPinned) {
          popover.style.display = 'none';
          rootEl.style.zIndex = '30';
        }
      };

      topBar.addEventListener('mouseenter', showPopover);
      rootEl.addEventListener('mouseleave', hidePopover);

      const togglePin = (e) => {
        e.stopPropagation();
        popoverPinned = !popoverPinned;
        if (popoverPinned) {
          showPopover();
          if (pinBtn) pinBtn.innerText = i18n.pinnedBtn;
        } else {
          hidePopover();
          if (pinBtn) pinBtn.innerText = i18n.pinBtn;
        }
      };

      topBar.addEventListener('click', togglePin);
      btnDetail.addEventListener('click', togglePin);

      closeBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        popoverPinned = false;
        popover.style.display = 'none';
        rootEl.style.zIndex = '30';
        if (pinBtn) pinBtn.innerText = i18n.pinBtn;
      });

      if (!documentClickBound) {
        documentClickBound = true;
        document.addEventListener('click', (e) => {
          if (!rootEl || !rootEl.contains(e.target)) {
            popoverPinned = false;
            const pop = document.getElementById('agy-context-popover');
            if (pop) pop.style.display = 'none';
            const r = document.getElementById('agy-context-root');
            if (r) r.style.zIndex = '30';
            const pin = document.getElementById('agy-pin-btn');
            if (pin) pin.innerText = i18n.pinBtn;
          }
        });
      }

      refreshBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        refreshIcon.classList.add('rotating');
        updateStats(true);
        setTimeout(() => {
          refreshIcon.classList.remove('rotating');
        }, 600);
      });
    }

    positionWidget();
  }

  // 动态获取当前选中的对话/项目 Conversation ID
  function getActiveConversationId() {
    // 1. 从 URL 路径、Hash 或 search 获取当前明确打开的会话 UUID
    const pathAndHash = (window.location.pathname || '') + (window.location.hash || '');
    const urlMatch = pathAndHash.match(/\/c\/([0-9a-fA-F-]{36})/);
    if (urlMatch && urlMatch[1]) return urlMatch[1];

    const paramMatch = (window.location.search || '').match(/[?&]cascadeId=([0-9a-fA-F-]{36})/);
    if (paramMatch && paramMatch[1]) return paramMatch[1];

    // 2. 侧边栏当前选中的对话条目
    const activeRow = document.querySelector('[data-cascade-id][data-selected="true"]') ||
                      document.querySelector('[data-testid^="conversation-row-"][data-selected="true"]');
    if (activeRow) {
      const cid = activeRow.getAttribute('data-cascade-id');
      if (cid && cid !== '_new' && /^[0-9a-fA-F-]{36}$/.test(cid)) return cid;
      if (cid === '_new') return null; // 明确为新建对话
    }

    // 3. 备选：查找带 secondary 高亮类名的行
    const rows = document.querySelectorAll('[data-cascade-id]');
    for (const r of rows) {
      if (r.getAttribute('data-selected') === 'true' || r.classList.contains('bg-secondary')) {
        const cid = r.getAttribute('data-cascade-id');
        if (cid && cid !== '_new' && /^[0-9a-fA-F-]{36}$/.test(cid)) return cid;
        if (cid === '_new') return null;
      }
    }

    return null;
  }

  let cachedModelName = 'Gemini 3.8 Flash';
  let lastModelCheck = 0;

  function detectActiveModel() {
    const now = Date.now();
    if (now - lastModelCheck < 3000 && cachedModelName) {
      return cachedModelName;
    }
    lastModelCheck = now;

    // 优先从页面按钮或角色按钮中查找模型名称，避免扫描全量 DOM (div/span) 触发重排 Layout Thrashing
    const candidates = document.querySelectorAll('button, [role="button"]');
    for (const el of candidates) {
      const text = (el.textContent || '').trim();
      if ((text.includes('Gemini') || text.includes('Claude') || text.includes('GPT')) && text.length < 35) {
        cachedModelName = text;
        return text;
      }
    }
    return cachedModelName || 'Gemini 3.8 Flash';
  }

  // 精确侦测 @ 引用菜单与 / 斜杠命令（工具调用）菜单以及项目选择下拉菜单是否处于展开状态
  function getTypeaheadOrMentionMenu() {
    // 1. 直接侦测新建对话专属项目/工作区选择器触发按钮是否处于展开状态
    const projectTrigger = document.querySelector('[data-testid="project-selector-trigger"]') ||
                           document.querySelector('[aria-label^="Select project"]') ||
                           document.querySelector('[aria-label^="Select workspace"]');
    if (projectTrigger && projectTrigger.offsetParent !== null) {
      if (projectTrigger.getAttribute('aria-expanded') === 'true' || 
          projectTrigger.getAttribute('data-state') === 'open') {
        return projectTrigger;
      }
    }

    // 2. 项目选择弹窗专属内容元素
    const projectMenuSelectors = [
      '[data-testid="project-selector-search"]',
      '[data-testid="project-selector-item"]',
      '[data-project-name]',
      '[data-pseudo-project]'
    ];
    for (const sel of projectMenuSelectors) {
      const el = document.querySelector(sel);
      if (el && el.isConnected) {
        const p = el.closest('[data-radix-popper-content-wrapper], [role="menu"], [role="listbox"], [data-state="open"]') || el;
        const r = p.getBoundingClientRect();
        if (r.height > 0 && r.width > 0) return p;
      }
    }

    // 3. 明确的 mention / slash 命令容器 (Lexical 渲染的列表)
    const selectors = [
      '[data-mention-menu]',
      '#typeahead-menu',
      '.mentions-menu',
      '.typeahead-popover',
      '[role="listbox"][aria-label="Mentions"]',
      '[role="listbox"][aria-label="提及"]',
      '[role="listbox"][aria-label="预输入菜单"]',
      '[role="listbox"][aria-label*="Mention"]',
      '[role="listbox"][aria-label*="Typeahead"]',
      '[role="listbox"][aria-label*="Slash"]'
    ];
    for (const sel of selectors) {
      const el = document.querySelector(sel);
      if (el && el.isConnected) {
        const rect = el.getBoundingClientRect();
        if (rect.height > 0 && (rect.width > 0 || el.children.length > 0)) {
          return el;
        }
      }
    }

    // 4. 检查是否有处于高亮或展开状态的 typeahead 选项
    const activeItem = document.querySelector('[id^="typeahead-item-"]');
    if (activeItem && activeItem.isConnected) {
      const parentMenu = activeItem.closest('[role="listbox"]') || activeItem.parentElement;
      if (parentMenu) return parentMenu;
    }

    // 5. 检查输入框本身是否有 aria-controls="typeahead-menu" 且目标已挂载并有实际子内容
    const controlledInput = document.querySelector('[aria-controls="typeahead-menu"]');
    if (controlledInput) {
      const target = document.getElementById('typeahead-menu');
      if (target && target.isConnected && (target.children.length > 0 || target.getBoundingClientRect().height > 0)) return target;
    }

    // 6. 检查展开状态的项目/工作区选择下拉弹出层
    const openPoppers = document.querySelectorAll('[data-radix-popper-content-wrapper], [role="menu"], [role="listbox"], [data-state="open"]');
    for (const popper of openPoppers) {
      if (popper.isConnected) {
        if (popper.id === 'agy-context-popover' || popper.closest('#agy-context-root')) {
          continue;
        }
        const r = popper.getBoundingClientRect();
        if (r.height > 0 && r.width > 0) {
          if (
            popper.querySelector('[data-testid*="project"]') || 
            popper.querySelector('[data-project-name]') ||
            popper.querySelector('[data-pseudo-project]') ||
            (popper.innerText && (
              popper.innerText.includes('No Project') ||
              popper.innerText.includes('Select Project') ||
              popper.innerText.includes('Standalone Conversation') ||
              popper.innerText.includes('Add Workspace')
            ))
          ) {
            return popper;
          }
        }
      }
    }

    return null;
  }

  function positionWidget() {
    if (!rootEl) return;

    // 检测是否进入设置页面或非对话页面
    const isSettings = (window.location.pathname && window.location.pathname.includes('settings')) || 
                       (window.location.hash && window.location.hash.includes('settings')) || 
                       document.querySelector('[data-testid="settings-page"]') || 
                       document.querySelector('[aria-label="Settings"]') || document.querySelector('[aria-label="设置"]');

    // 寻找主对话输入框
    const inputBox = document.getElementById('antigravity.agentSidePanelInputBox') || 
                     document.querySelector('[data-testid="agent-input-box"]');

    // 如果在设置页，或者对话框不存在/已被隐藏，立即彻底隐藏状态栏
    if (isSettings || !inputBox || inputBox.offsetParent === null) {
      rootEl.classList.add('agy-hidden');
      rootEl.style.setProperty('display', 'none', 'important');
      rootEl.style.setProperty('opacity', '0', 'important');
      rootEl.style.setProperty('visibility', 'hidden', 'important');
      rootEl.style.setProperty('pointer-events', 'none', 'important');
      const popover = rootEl.querySelector('#agy-context-popover');
      if (popover) popover.style.display = 'none';
      return;
    }

    const rect = inputBox.getBoundingClientRect();
    if (!rect || rect.width === 0 || rect.height === 0) {
      rootEl.classList.add('agy-hidden');
      rootEl.style.setProperty('display', 'none', 'important');
      rootEl.style.setProperty('opacity', '0', 'important');
      rootEl.style.setProperty('visibility', 'hidden', 'important');
      rootEl.style.setProperty('pointer-events', 'none', 'important');
      return;
    }

    // 显式侦测新建对话专属项目/工作区选择器（如：button[data-testid="project-selector-trigger"]）
    const projectTrigger = document.querySelector('[data-testid="project-selector-trigger"]') ||
                           document.querySelector('[aria-label^="Select project"]') ||
                           document.querySelector('[aria-label^="Select workspace"]');

    // 检测是否有 @ (mentions) 或 / (slash command / tools) 联想菜单正在弹出显示
    const typeaheadMenu = getTypeaheadOrMentionMenu();

    // 始终清理 projectTrigger 按钮本身的异常高层级 z-index，避免其残留浮在命令菜单上方导致严重重叠
    if (projectTrigger && (!typeaheadMenu || (typeaheadMenu.getAttribute && typeaheadMenu.getAttribute('data-testid') !== 'project-selector-trigger'))) {
      projectTrigger.style.removeProperty('z-index');
      if (projectTrigger.parentElement) {
        projectTrigger.parentElement.style.removeProperty('z-index');
      }
    }

    if (typeaheadMenu) {
      // 1. 将提示菜单提到最高层级，保证无遮挡且百分百可点击
      try {
        if (!typeaheadMenu.getAttribute || typeaheadMenu.getAttribute('data-testid') !== 'project-selector-trigger') {
          typeaheadMenu.style.zIndex = '99999';
          if (typeaheadMenu.parentElement && typeaheadMenu.parentElement.classList && typeaheadMenu.parentElement.classList.contains('relative')) {
            typeaheadMenu.parentElement.style.zIndex = '9999';
          }
        }
      } catch (e) {}

      // 2. 关键防重叠：在新建对话（未选项目或包含项目选择器按钮时），斜杠/艾特命令菜单默认在 inputBox 上方 (bottom-full mb-2)
      // 这会导致其底部与上方紧邻的“新建对话”/项目选择器重叠。
      // 我们动态计算 projectTrigger / pContainer 的位置，若存在于输入框正上方，则将菜单整体上移至其上方！
      try {
        if (projectTrigger && projectTrigger.offsetParent !== null && inputBox) {
          const pContainer = projectTrigger.closest('.no-focus-agent-input') || 
                             projectTrigger.closest('[class*="flex-col"]') || 
                             projectTrigger;
          const pRect = pContainer.getBoundingClientRect();
          const iRect = inputBox.getBoundingClientRect();
          if (pRect.height > 0 && pRect.top > 0 && pRect.top < iRect.top) {
            const offset = Math.round(iRect.top - pRect.top + 6);
            typeaheadMenu.style.bottom = 'calc(100% + ' + offset + 'px)';
            typeaheadMenu.style.marginBottom = '0px';

            // 防止窗口上方视口空间不足被截断
            const mRect = typeaheadMenu.getBoundingClientRect();
            if (mRect.top < 10) {
              const maxH = Math.max(120, Math.floor(iRect.top - offset - 10));
              typeaheadMenu.style.maxHeight = maxH + 'px';
            }
          }
        }
      } catch (e) {}

      // 隐藏长条组件并禁止点击，将视口空间完全让渡给工具/引用选择器
      rootEl.classList.add('agy-hidden');
      rootEl.style.setProperty('display', 'none', 'important');
      rootEl.style.setProperty('opacity', '0', 'important');
      rootEl.style.setProperty('visibility', 'hidden', 'important');
      rootEl.style.setProperty('pointer-events', 'none', 'important');
      const popover = rootEl.querySelector('#agy-context-popover');
      if (popover) popover.style.display = 'none';
      return;
    }

    // 菜单关闭后，完整恢复正常显示与交互能力
    rootEl.classList.remove('agy-hidden');
    rootEl.style.removeProperty('display');
    rootEl.style.removeProperty('opacity');
    rootEl.style.removeProperty('visibility');
    rootEl.style.removeProperty('pointer-events');

    // 顶部横条状对齐对话框
    // 关键优化：防遮挡新建对话时左上角出现的“项目选择”栏（project-selector）
    let effectiveTop = rect.top;

    // 1. 显式侦测新建对话专属项目/工作区选择器（如：button[data-testid="project-selector-trigger"]）
    if (projectTrigger && projectTrigger.offsetParent !== null) {
      const pContainer = projectTrigger.closest('.no-focus-agent-input') || 
                         projectTrigger.closest('[class*="flex-col"]') || 
                         projectTrigger;
      const pRect = pContainer.getBoundingClientRect();
      if (pRect.height > 0 && pRect.top > 0 && pRect.top < effectiveTop && pRect.bottom <= effectiveTop + 30) {
        effectiveTop = Math.min(effectiveTop, pRect.top);
      }
    }

    // 2. 深度遍历输入框容器内部子节点、前置兄弟节点及父层前置兄弟节点（防遮挡横幅、标签栏等）
    let curr = inputBox;
    for (let depth = 0; depth < 4 && curr && curr !== document.body; depth++) {
      if (curr !== inputBox && curr.children) {
        for (const child of curr.children) {
          if (!child.contains(inputBox) && child.offsetParent !== null) {
            const cRect = child.getBoundingClientRect();
            if (cRect.height > 0 && cRect.height < 150 && cRect.top > 0 && cRect.top < effectiveTop && cRect.bottom <= effectiveTop + 30) {
              effectiveTop = Math.min(effectiveTop, cRect.top);
            }
          }
        }
      }
      let prev = curr.previousElementSibling;
      while (prev) {
        if (prev.offsetParent !== null) {
          const sRect = prev.getBoundingClientRect();
          if (sRect.height > 0 && sRect.height < 150 && sRect.top > 0 && sRect.top < effectiveTop && sRect.bottom <= effectiveTop + 30) {
            effectiveTop = Math.min(effectiveTop, sRect.top);
          }
        }
        prev = prev.previousElementSibling;
      }
      curr = curr.parentElement;
    }

    const targetLeft = rect.left;
    const targetWidth = rect.width;
    const targetBottom = window.innerHeight - effectiveTop + 6;

    rootEl.style.position = 'fixed';
    rootEl.style.left = Math.round(targetLeft) + 'px';
    rootEl.style.width = Math.round(targetWidth) + 'px';
    rootEl.style.bottom = Math.round(Math.max(6, targetBottom)) + 'px';
    rootEl.style.display = 'block';
    rootEl.style.visibility = 'visible';
    rootEl.style.opacity = '1';
    rootEl.style.pointerEvents = 'auto';
  }

  async function updateStats(force) {
    if (!rootEl) return;

    // 嗅探当前选中的会话 ID
    const activeConvoId = getActiveConversationId();
    currentConvoId = activeConvoId;

    let stats = null;

    if (!currentConvoId || currentConvoId === '_new') {
      // 当前是新建对话或尚未打开具体项目会话，严格置为 0%
      stats = {
        convoId: null,
        totalTokens: 0,
        toolOutputTokens: 0,
        modelOutputTokens: 0,
        modelThinkingTokens: 0,
        userTokens: 0,
        systemPromptTokens: 0,
        artifactsTokens: 0,
        stepCount: 0
      };
    } else {
      // 1. 本地微服务极速读取，传入当前会话 ID
      try {
        const url = 'http://127.0.0.1:49152/stats?convoId=' + encodeURIComponent(currentConvoId);
        const res = await fetch(url, { signal: AbortSignal.timeout(600) });
        if (res.ok) {
          stats = await res.json();
        }
      } catch (e) {}

      // 2. 备选：Electron 主进程 IPC 读取
      if (!stats) {
        try {
          stats = await electron_1.ipcRenderer.invoke('context:get-stats', currentConvoId);
        } catch (e) {}
      }
    }

    if (!stats) {
      stats = {
        convoId: currentConvoId,
        totalTokens: 0,
        toolOutputTokens: 0,
        modelOutputTokens: 0,
        modelThinkingTokens: 0,
        userTokens: 0,
        systemPromptTokens: 0,
        artifactsTokens: 0
      };
    }

    const totalTokens = stats.totalTokens || 0;
    const modelName = detectActiveModel();
    const maxLimit = getModelContextLimit(modelName);
    const pct = (totalTokens && maxLimit) ? Math.min(100, (totalTokens / maxLimit) * 100) : 0;

    const pctEl = rootEl.querySelector('#agy-pct-val');
    const usedEl = rootEl.querySelector('#agy-used-val');
    const maxEl = rootEl.querySelector('#agy-max-val');
    const dotEl = rootEl.querySelector('#agy-status-dot');
    const modelBadge = rootEl.querySelector('#agy-model-badge');

    if (pctEl) pctEl.innerText = pct.toFixed(1) + '%';
    if (usedEl) usedEl.innerText = formatTokens(totalTokens);
    if (maxEl) maxEl.innerText = '/ ' + formatTokens(maxLimit);
    if (modelBadge) modelBadge.innerText = modelName;

    if (dotEl) {
      dotEl.className = 'agy-dot';
      if (pct >= 80) {
        dotEl.classList.add('status-red');
      } else if (pct >= 50) {
        dotEl.classList.add('status-yellow');
      }
    }

    const scale = (totalTokens > maxLimit && maxLimit > 0) ? (maxLimit / totalTokens) : 1;
    const setTrackSegment = (id, tokens, titleName) => {
      const el = rootEl.querySelector(id);
      if (el) {
        const tok = tokens || 0;
        if (totalTokens === 0 || !maxLimit) {
          el.style.width = '0%';
        } else {
          const segPct = (((tok * scale) / maxLimit) * 100);
          el.style.width = segPct.toFixed(2) + '%';
        }
        const capPct = (maxLimit > 0 && tok > 0) ? ((tok / maxLimit) * 100).toFixed(1) + '%' : '0%';
        el.title = `${titleName}: ${formatTokens(tok)} (${capPct})`;
      }
    };

    setTrackSegment('#agy-seg-tools', stats.toolOutputTokens, i18n.toolsTitle);
    setTrackSegment('#agy-seg-model', stats.modelOutputTokens, i18n.modelTitle);
    setTrackSegment('#agy-seg-think', stats.modelThinkingTokens, i18n.thinkTitle);
    setTrackSegment('#agy-seg-user', stats.userTokens, i18n.userTitle);
    setTrackSegment('#agy-seg-system', stats.systemPromptTokens, i18n.sysTitle);
    setTrackSegment('#agy-seg-artifacts', stats.artifactsTokens, i18n.artTitle);

    const setText = (id, text) => {
      const el = rootEl.querySelector(id);
      if (el) el.innerText = text;
    };

    setText('#agy-pop-model-badge', modelName);

    const updatePopRow = (prefix, label, tokens) => {
      const tok = tokens || 0;
      const capPct = (maxLimit > 0 && tok > 0) ? ((tok / maxLimit) * 100) : 0;
      const usedPct = (totalTokens > 0 && tok > 0) ? ((tok / totalTokens) * 100) : 0;

      setText(`#pop-${prefix}-tok`, tok.toLocaleString());
      setText(`#pop-${prefix}-pct`, capPct.toFixed(1) + '%');

      const bar = rootEl.querySelector(`#pop-${prefix}-bar`);
      if (bar) {
        bar.style.width = Math.min(100, capPct).toFixed(1) + '%';
      }

      const tokEl = rootEl.querySelector(`#pop-${prefix}-tok`);
      const row = tokEl ? tokEl.closest('.agy-stat-row') : null;
      if (row) {
        row.title = isZh
          ? `${label}: ${tok.toLocaleString()} Tokens (占总容量 ${capPct.toFixed(2)}% / 占已用 ${usedPct.toFixed(1)}%)`
          : `${label}: ${tok.toLocaleString()} Tokens (${capPct.toFixed(2)}% of capacity / ${usedPct.toFixed(1)}% of used)`;
      }
    };

    updatePopRow('tools', i18n.toolsLabel, stats.toolOutputTokens);
    updatePopRow('model', i18n.modelLabel, stats.modelOutputTokens);
    updatePopRow('think', i18n.thinkLabel, stats.modelThinkingTokens);
    updatePopRow('user', i18n.userLabel, stats.userTokens);
    updatePopRow('sys', i18n.sysLabel, stats.systemPromptTokens);
    updatePopRow('art', i18n.artLabel, stats.artifactsTokens);

    const healthBadge = rootEl.querySelector('#agy-health-badge');
    if (healthBadge) {
      const availTokens = Math.max(0, maxLimit - totalTokens);
      if (pct < 50) {
        healthBadge.innerText = i18n.healthGood(formatTokens(availTokens));
        healthBadge.style.color = '#34d399';
        healthBadge.style.borderColor = 'rgba(16, 185, 129, 0.3)';
        healthBadge.style.background = 'rgba(16, 185, 129, 0.15)';
      } else if (pct < 80) {
        healthBadge.innerText = i18n.healthMed(formatTokens(availTokens));
        healthBadge.style.color = '#fbbf24';
        healthBadge.style.borderColor = 'rgba(245, 158, 11, 0.3)';
        healthBadge.style.background = 'rgba(245, 158, 11, 0.15)';
      } else {
        healthBadge.innerText = i18n.healthWarn;
        healthBadge.style.color = '#f87171';
        healthBadge.style.borderColor = 'rgba(239, 68, 68, 0.3)';
        healthBadge.style.background = 'rgba(239, 68, 68, 0.15)';
      }
    }
  }

  function init() {
    const tryMount = () => {
      if (!document.body) {
        setTimeout(tryMount, 50);
        return;
      }
      ensureWidget();
      updateStats();

      window.addEventListener('resize', schedulePositionWidget);
      window.addEventListener('scroll', schedulePositionWidget, true);

      // 监听快捷键触发与按键，对 @ / 及回车、Esc、退格等极速响应，消除延迟同时避免定时器雪崩
      window.addEventListener('keydown', (e) => {
        if (e.key === '@' || e.key === '/' || e.key === 'Backspace' || e.key === 'Escape' || e.key === 'Enter') {
          schedulePositionWidget();
          setTimeout(schedulePositionWidget, 40);
        }
      }, true);

      window.addEventListener('input', schedulePositionWidget, true);
      window.addEventListener('pointerdown', schedulePositionWidget, true);

      // 1.5s 极速轮询与动态位置纠正
      setInterval(() => {
        schedulePositionWidget();
        updateStats();
      }, 1500);

      let observerRafId = null;
      const observer = new MutationObserver(() => {
        if (observerRafId !== null) return;
        observerRafId = requestAnimationFrame(() => {
          observerRafId = null;
          positionWidget();
          const newCid = getActiveConversationId();
          if (newCid !== currentConvoId) {
            updateStats();
          }
        });
      });
      observer.observe(document.body, { childList: true, subtree: true });
    };

    tryMount();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
