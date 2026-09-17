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


function getConversationStats(targetConvoId) {
  if (!targetConvoId || targetConvoId === '_new' || typeof targetConvoId !== 'string') {
    return {
      convoId: null,
      userTokens: 0,
      modelThinkingTokens: 0,
      modelOutputTokens: 0,
      toolOutputTokens: 0,
      systemPromptTokens: 0,
      artifactsTokens: 0,
      totalTokens: 0,
      stepCount: 0
    };
  }

  // 安全入参校验，抵御任何可能的路径穿越字符
  if (!/^[0-9a-zA-Z_-]+$/.test(targetConvoId)) {
    return {
      convoId: null,
      userTokens: 0,
      modelThinkingTokens: 0,
      modelOutputTokens: 0,
      toolOutputTokens: 0,
      systemPromptTokens: 0,
      artifactsTokens: 0,
      totalTokens: 0,
      stepCount: 0
    };
  }

  const convoId = targetConvoId;
  const brainDir = path.join(os.homedir(), '.gemini', 'antigravity', 'brain');
  const logFile = path.join(brainDir, convoId, '.system_generated', 'logs', 'transcript_full.jsonl');
  const fallbackLog = path.join(brainDir, convoId, '.system_generated', 'logs', 'transcript.jsonl');

  const targetFile = fs.existsSync(logFile) ? logFile : fallbackLog;
  if (!fs.existsSync(targetFile)) {
    return {
      convoId,
      userTokens: 0,
      modelThinkingTokens: 0,
      modelOutputTokens: 0,
      toolOutputTokens: 0,
      systemPromptTokens: 0,
      artifactsTokens: 0,
      totalTokens: 0,
      stepCount: 0
    };
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

    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const step = JSON.parse(line);
        validStepsCount++;
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
      stepCount: validStepsCount
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
    return fallback ? fallback.stats : {
      convoId,
      userTokens: 0,
      modelThinkingTokens: 0,
      modelOutputTokens: 0,
      toolOutputTokens: 0,
      systemPromptTokens: 0,
      artifactsTokens: 0,
      totalTokens: 0,
      stepCount: 0
    };
  }
}

module.exports = {
  getConversationStats,
  getActiveConversationId
};
