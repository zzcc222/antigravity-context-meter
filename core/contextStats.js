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
  const annotDir = path.join(os.homedir(), '.gemini', 'antigravity', 'annotations');
  if (fs.existsSync(annotDir)) {
    try {
      const files = fs.readdirSync(annotDir);
      let latestConvo = null;
      let maxTime = 0;

      for (const f of files) {
        if (f.endsWith('.pbtxt')) {
          const text = fs.readFileSync(path.join(annotDir, f), 'utf8');
          const mSec = text.match(/seconds:\s*(\d+)/);
          const mNano = text.match(/nanos:\s*(\d+)/);
          if (mSec) {
            const sec = parseInt(mSec[1], 10);
            const nano = mNano ? parseInt(mNano[1], 10) : 0;
            const totalTime = sec * 1000 + Math.floor(nano / 1000000);
            if (totalTime > maxTime) {
              maxTime = totalTime;
              latestConvo = f.replace('.pbtxt', '');
            }
          }
        }
      }
      if (latestConvo) return latestConvo;
    } catch (e) {}
  }

  const brainDir = path.join(os.homedir(), '.gemini', 'antigravity', 'brain');
  if (!fs.existsSync(brainDir)) return null;

  try {
    const entries = fs.readdirSync(brainDir);
    let latestConvo = null;
    let latestMtime = 0;

    for (const id of entries) {
      const logFile = path.join(brainDir, id, '.system_generated', 'logs', 'transcript.jsonl');
      if (fs.existsSync(logFile)) {
        const stat = fs.statSync(logFile);
        if (stat.mtimeMs > latestMtime) {
          latestMtime = stat.mtimeMs;
          latestConvo = id;
        }
      }
    }
    return latestConvo;
  } catch (e) {
    return null;
  }
}

let cachedStats = null;
let cachedMtime = 0;
let cachedConvoId = null;

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
    if (cachedStats && cachedConvoId === convoId && stat.mtimeMs === cachedMtime) {
      return cachedStats;
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
            const artText = fs.readFileSync(path.join(artifactsDir, file), 'utf8');
            artifactsTokens += estimateTokens(artText);
          }
        }
      }
    } catch (e) {}

    const totalTokens = userTokens + modelThinkingTokens + modelOutputTokens + toolOutputTokens + systemPromptTokens + artifactsTokens;

    cachedStats = {
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
    cachedMtime = stat.mtimeMs;
    cachedConvoId = convoId;

    return cachedStats;
  } catch (e) {
    console.error('[contextStats] Error reading log:', e);
    return cachedStats;
  }
}

module.exports = {
  getConversationStats,
  getActiveConversationId
};
