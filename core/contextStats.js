const fs = require('fs');
const path = require('path');
const os = require('os');

function estimateTokens(text) {
  if (!text || typeof text !== 'string') return 0;
  let cjkCount = 0;
  let otherCount = 0;
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    // CJK 统一汉字、扩展 A 区、兼容汉字
    // 中文全角标点符号 (0x3000-0x303f, 0xff00-0xffef)
    // 日文假名 (0x3040-0x30ff)、韩文字母与音节 (0xac00-0xd7af)
    if (
      (code >= 0x4e00 && code <= 0x9fff) ||
      (code >= 0x3400 && code <= 0x4dbf) ||
      (code >= 0xf900 && code <= 0xfaff) ||
      (code >= 0x3000 && code <= 0x303f) ||
      (code >= 0xff00 && code <= 0xffef) ||
      (code >= 0x3040 && code <= 0x30ff) ||
      (code >= 0xac00 && code <= 0xd7af)
    ) {
      cjkCount++;
    } else {
      otherCount++;
    }
  }
  return Math.round(cjkCount * 1.15 + otherCount / 3.7);
}

function getActiveConversationId() {
  // 服务端不需要主动扫描，由前端 DOM 准确实时嗅探并通过 query 传入
  return null;
}

const statsCache = new Map(); // convoId -> { mtimeMs, stats }
const artifactCache = new Map(); // filePath -> { mtimeMs, tokens }


function createDefaultStats(convoId = null) {
  return {
    convoId,
    userTokens: 0,
    modelThinkingTokens: 0,
    modelOutputTokens: 0,
    toolOutputTokens: 0,
    systemPromptTokens: 0,
    artifactsTokens: 0,
    totalTokens: 0,
    stepCount: 0,
    lastTurn: {
      tokens: 0,
      thinkingTokens: 0,
      outputTokens: 0,
      durationSeconds: 0,
      rate: 0
    }
  };
}

function extractLastTurnStats(steps) {
  if (!Array.isArray(steps) || steps.length === 0) {
    return {
      tokens: 0,
      thinkingTokens: 0,
      outputTokens: 0,
      durationSeconds: 0,
      rate: 0
    };
  }

  // 1. 逆向定位最近一个包含实质内容（输出给用户展示）的 PLANNER_RESPONSE
  let targetRespIdx = -1;
  for (let i = steps.length - 1; i >= 0; i--) {
    const s = steps[i];
    if (s.type === 'PLANNER_RESPONSE' && s.content && s.content.trim().length > 0) {
      targetRespIdx = i;
      break;
    }
  }

  // 2. 备选：如果当前只有思考步骤（例如正在推理尚未吐出正文），取最近一个包含 thinking 的 PLANNER_RESPONSE
  if (targetRespIdx === -1) {
    for (let i = steps.length - 1; i >= 0; i--) {
      const s = steps[i];
      if (s.type === 'PLANNER_RESPONSE' && s.thinking && s.thinking.length > 0) {
        targetRespIdx = i;
        break;
      }
    }
  }

  if (targetRespIdx === -1) {
    return {
      tokens: 0,
      thinkingTokens: 0,
      outputTokens: 0,
      durationSeconds: 0,
      rate: 0
    };
  }

  const resp = steps[targetRespIdx];
  const outputTokens = estimateTokens(resp.content || '');
  const thinkingTokens = estimateTokens(resp.thinking || '');
  const totalTokens = outputTokens + thinkingTokens;

  // 耗时计算：精确计算该次对话生成的实际耗时（与前置步骤的时间差，剔除漫长的后台命令执行）
  let durationSeconds = 0;
  const prev = steps[targetRespIdx - 1];
  if (prev && resp.created_at && prev.created_at) {
    const tCurr = new Date(resp.created_at).getTime();
    const tPrev = new Date(prev.created_at).getTime();
    const diffSec = (tCurr - tPrev) / 1000;
    // 单次对话回复通常在数秒至几十秒之间完成
    // 若时间差在合理范围且隐含速率在模型物理区间（20 ~ 130 tok/s）内，采纳真实时间差
    if (diffSec >= 2 && diffSec < 180) {
      const impliedRate = totalTokens / diffSec;
      if (impliedRate <= 130 && impliedRate >= 20) {
        durationSeconds = Math.round(diffSec * 10) / 10;
      }
    }
  }

  // 时间戳过于粗糙（处于同一秒或时间差过小导致速率虚高）时的自然物理基准平滑
  // 基于主流模型（Gemini / Claude）典型单次平均吐字速率约 75 tok/s
  if (durationSeconds <= 0 && totalTokens > 0) {
    durationSeconds = Math.max(0.5, Math.round((totalTokens / 75) * 10) / 10);
  }

  const rate = (totalTokens > 0 && durationSeconds > 0)
    ? Math.round((totalTokens / durationSeconds) * 10) / 10
    : 0;

  return {
    tokens: totalTokens,
    thinkingTokens,
    outputTokens,
    durationSeconds,
    rate
  };
}

function getConversationStats(targetConvoId) {
  if (!targetConvoId || targetConvoId === '_new' || typeof targetConvoId !== 'string') {
    return createDefaultStats(null);
  }

  // 安全入参校验，抵御任何可能的路径穿越字符
  if (!/^[0-9a-zA-Z_-]+$/.test(targetConvoId)) {
    return createDefaultStats(null);
  }

  const convoId = targetConvoId;
  const brainDir = path.join(os.homedir(), '.gemini', 'antigravity', 'brain');
  const logFile = path.join(brainDir, convoId, '.system_generated', 'logs', 'transcript_full.jsonl');
  const fallbackLog = path.join(brainDir, convoId, '.system_generated', 'logs', 'transcript.jsonl');

  const targetFile = fs.existsSync(logFile) ? logFile : fallbackLog;
  if (!fs.existsSync(targetFile)) {
    return createDefaultStats(convoId);
  }

  try {
    const stat = fs.statSync(targetFile);
    const cached = statsCache.get(convoId);
    if (cached && cached.mtimeMs === stat.mtimeMs) {
      return cached.stats;
    }

    const content = fs.readFileSync(targetFile, 'utf8');
    const lines = content.trim().split('\n');

    let userTokens = 0;
    let modelThinkingTokens = 0;
    let modelOutputTokens = 0;
    let toolOutputTokens = 0;
    let systemPromptTokens = 0;
    let artifactsTokens = 0;
    let validStepsCount = 0;
    const parsedSteps = [];

    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const step = JSON.parse(line);
        validStepsCount++;
        parsedSteps.push(step);
        const text = step.content || '';
        const thinking = step.thinking || '';
        const toolCalls = step.tool_calls ? JSON.stringify(step.tool_calls) : '';

        if (step.source === 'USER_EXPLICIT' || step.type === 'USER_INPUT') {
          userTokens += estimateTokens(text);
        } else if (step.type === 'PLANNER_RESPONSE') {
          modelThinkingTokens += estimateTokens(thinking);
          modelOutputTokens += estimateTokens(text) + estimateTokens(toolCalls);
        } else if (step.type === 'GENERIC') {
          toolOutputTokens += estimateTokens(text);
        } else if (step.source === 'SYSTEM') {
          systemPromptTokens += estimateTokens(text);
        } else {
          toolOutputTokens += estimateTokens(text);
        }
      } catch (err) {}
    }

    // 仅当会话中已有真实交互记录时，才叠加 3500 的系统规则基线；空白会话不赋初值
    if (validStepsCount > 0) {
      systemPromptTokens += 3500;
    }

    const lastTurn = extractLastTurnStats(parsedSteps);

    const artifactsDir = path.join(brainDir, convoId);
    try {
      if (fs.existsSync(artifactsDir)) {
        const files = fs.readdirSync(artifactsDir);
        for (const file of files) {
          if (file.endsWith('.md')) {
            const fullArtPath = path.join(artifactsDir, file);
            try {
              const artStat = fs.statSync(fullArtPath);
              const cachedArt = artifactCache.get(fullArtPath);
              if (cachedArt && cachedArt.mtimeMs === artStat.mtimeMs) {
                artifactsTokens += cachedArt.tokens;
              } else {
                const artText = fs.readFileSync(fullArtPath, 'utf8');
                const tok = estimateTokens(artText);
                artifactCache.set(fullArtPath, { mtimeMs: artStat.mtimeMs, tokens: tok });
                artifactsTokens += tok;
              }
            } catch (e) {}
          }
        }
      }
    } catch (e) {}

    const totalTokens = userTokens + modelThinkingTokens + modelOutputTokens + toolOutputTokens + systemPromptTokens + artifactsTokens;

    const computedStats = {
      convoId,
      userTokens,
      modelThinkingTokens,
      modelOutputTokens,
      toolOutputTokens,
      systemPromptTokens,
      artifactsTokens,
      totalTokens,
      stepCount: validStepsCount,
      lastTurn
    };

    if (statsCache.size > 100) {
      statsCache.clear();
    }
    statsCache.set(convoId, {
      mtimeMs: stat.mtimeMs,
      stats: computedStats
    });

    return computedStats;
  } catch (e) {
    console.error('[contextStats] Error reading log:', e);
    const fallback = statsCache.get(convoId);
    return fallback ? fallback.stats : createDefaultStats(convoId);
  }
}

module.exports = {
  getConversationStats,
  getActiveConversationId
};
