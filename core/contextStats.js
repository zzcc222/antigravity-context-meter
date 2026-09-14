const fs = require('fs');
const path = require('path');
const os = require('os');

function estimateTokens(text) {
  if (!text || typeof text !== 'string') return 0;
  let cjkCount = 0;
  let otherCount = 0;
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    if (
      (code >= 0x4e00 && code <= 0x9fff) ||
      (code >= 0x3400 && code <= 0x4dbf) ||
      (code >= 0x20000 && code <= 0x2a6df) ||
      (code >= 0xf900 && code <= 0xfaff)
    ) {
      cjkCount++;
    } else {
      otherCount++;
    }
  }
  return Math.round(cjkCount * 1.25 + otherCount / 3.6);
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
  const convoId = targetConvoId || getActiveConversationId();
  if (!convoId) return null;

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
      systemPromptTokens: 3500,
      artifactsTokens: 0,
      totalTokens: 3500,
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
    let systemPromptTokens = 3500;
    let artifactsTokens = 0;

    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const step = JSON.parse(line);
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

    const artifactsDir = path.join(brainDir, convoId);
    try {
      const files = fs.readdirSync(artifactsDir);
      for (const file of files) {
        if (file.endsWith('.md')) {
          const artText = fs.readFileSync(path.join(artifactsDir, file), 'utf8');
          artifactsTokens += estimateTokens(artText);
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
      stepCount: lines.length
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
