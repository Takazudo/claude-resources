#!/usr/bin/env node

/**
 * log-conversation.mjs — save the current Claude Code conversation transcript
 * as two readable markdown files in $HOME/cclogs/{slug}/:
 *   {stamp}-conversation.md      — conversation only (text turns, no tools/thinking)
 *   {stamp}-conversation.raw.md  — full raw transcript (tools, thinking, tool results)
 *
 * Subcommands:
 *   start [--session ID] [--n N | --all] [--name NAME] [--end]
 *       Create a new state entry and write the log. --end deletes state after
 *       writing (for one-shot saves without a follow-up "end" call).
 *   refresh [--session ID]
 *       Re-read state and overwrite the log with everything from startUuid → now.
 *   end [--session ID]
 *       Refresh, then delete state.
 *   status [--session ID]
 *       Print current state for the session (or exit 1 if none).
 *
 * "--n N"  = start from the Nth-most-recent user turn (1 = most recent).
 * "--all"  = start from the very first user turn in the session.
 * default  = start from the most recent user turn (the one that invoked this).
 *
 * Session ID is auto-detected via CLAUDE_SESSION_ID env var when omitted.
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { pathToFileURL } from 'node:url';

const HOME = os.homedir();
const PROJECTS_DIR = path.join(HOME, '.claude', 'projects');

async function loadLogDir() {
  const mod = await import(
    pathToFileURL(path.join(HOME, '.claude', 'scripts', 'get-logdir.js')).href
  );
  return mod.getLogDir();
}

function parseArgs(argv) {
  const [cmd, ...rest] = argv;
  const opts = { cmd };
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i];
    if (a === '--session') opts.session = rest[++i];
    else if (a === '--n') opts.n = parseInt(rest[++i], 10);
    else if (a === '--all') opts.all = true;
    else if (a === '--end') opts.end = true;
    else if (a === '--name') opts.name = rest[++i];
    else throw new Error(`Unknown arg: ${a}`);
  }
  if (!opts.session) opts.session = process.env.CLAUDE_SESSION_ID;
  if (!opts.session) throw new Error('Session ID required (--session or $CLAUDE_SESSION_ID)');
  return opts;
}

function findTranscript(sessionId) {
  if (!fs.existsSync(PROJECTS_DIR)) throw new Error(`Projects dir missing: ${PROJECTS_DIR}`);
  for (const proj of fs.readdirSync(PROJECTS_DIR)) {
    const p = path.join(PROJECTS_DIR, proj, `${sessionId}.jsonl`);
    if (fs.existsSync(p)) return p;
  }
  throw new Error(`Transcript not found for session ${sessionId}`);
}

function readJsonl(file) {
  return fs
    .readFileSync(file, 'utf8')
    .split('\n')
    .filter((l) => l.trim())
    .map((l) => {
      try {
        return JSON.parse(l);
      } catch {
        return null;
      }
    })
    .filter(Boolean);
}

function isRealUserTurn(entry) {
  if (entry.type !== 'user' || entry.isMeta || entry.isSidechain) return false;
  const content = entry.message?.content;
  if (Array.isArray(content)) {
    return content.some((b) => b && b.type !== 'tool_result');
  }
  return typeof content === 'string' && content.length > 0;
}

function resolveStartUuid(entries, { n, all }) {
  if (all) {
    const first = entries.find(
      (e) => (e.type === 'user' || e.type === 'assistant') && !e.isSidechain
    );
    return first?.uuid;
  }
  const userTurns = entries.filter(isRealUserTurn);
  if (userTurns.length === 0) return entries[0]?.uuid;
  const idx = Math.max(0, userTurns.length - (n ?? 1));
  return userTurns[idx].uuid;
}

function fencedBlock(body, lang = '') {
  const str = typeof body === 'string' ? body : JSON.stringify(body, null, 2);
  const longest = [...str.matchAll(/`{3,}/g)].reduce((m, x) => Math.max(m, x[0].length), 0);
  const fence = '`'.repeat(Math.max(3, longest + 1));
  return `${fence}${lang}\n${str}\n${fence}`;
}

function stringifyBlock(block) {
  if (!block || typeof block !== 'object') return String(block);
  switch (block.type) {
    case 'text':
      return block.text ?? '';
    case 'thinking':
      return `_[thinking]_\n\n${fencedBlock(block.thinking ?? '')}`;
    case 'tool_use':
      return [
        `**Tool use: \`${block.name}\`** (id: \`${block.id}\`)`,
        fencedBlock(block.input ?? {}, 'json'),
      ].join('\n\n');
    case 'tool_result': {
      const content = block.content;
      let body;
      if (typeof content === 'string') body = content;
      else if (Array.isArray(content))
        body = content
          .map((c) => {
            if (!c || typeof c !== 'object') return String(c);
            if (c.type === 'text') return c.text ?? '';
            if (c.type === 'image') return `_[image: ${c.source?.media_type ?? 'unknown'}]_`;
            return JSON.stringify(c, null, 2);
          })
          .join('\n\n');
      else body = JSON.stringify(content, null, 2);
      const errTag = block.is_error ? ' (error)' : '';
      return [
        `**Tool result${errTag}** (for \`${block.tool_use_id}\`)`,
        fencedBlock(body ?? ''),
      ].join('\n\n');
    }
    case 'image':
      return `_[image: ${block.source?.media_type ?? 'unknown'}]_`;
    default:
      return fencedBlock(block, 'json');
  }
}

function renderContent(content) {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return JSON.stringify(content, null, 2);
  return content.map(stringifyBlock).join('\n\n');
}

function renderConversationContent(content) {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  return content
    .filter((b) => b && b.type === 'text')
    .map((b) => b.text ?? '')
    .filter((s) => s.length > 0)
    .join('\n\n');
}

function fmtTimestamp(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d)) return iso;
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function renderMarkdown(entries, meta, { conversationOnly = false } = {}) {
  const lines = [];
  lines.push(`# Conversation Log${conversationOnly ? '' : ' (raw)'}`);
  lines.push('');
  lines.push(`- Session: \`${meta.sessionId}\``);
  lines.push(`- Start UUID: \`${meta.startUuid}\``);
  lines.push(`- Rendered: ${fmtTimestamp(new Date().toISOString())}`);
  lines.push(`- Entries: ${entries.length}`);
  lines.push('');

  for (const e of entries) {
    if (e.type !== 'user' && e.type !== 'assistant') continue;
    if (e.isSidechain) continue;
    const role = e.message?.role === 'assistant' ? 'Assistant' : 'User';
    const metaTag = e.isMeta ? ' _(meta)_' : '';
    const body = conversationOnly
      ? renderConversationContent(e.message?.content)
      : renderContent(e.message?.content);
    if (conversationOnly && !body.trim()) continue;
    lines.push('---');
    lines.push('');
    lines.push(`## ${role}${metaTag} — ${fmtTimestamp(e.timestamp)}`);
    lines.push('');
    lines.push(body);
    lines.push('');
  }
  return lines.join('\n');
}

function stateFilePath(logdir, sessionId) {
  return path.join(logdir, `.log-conversation-state.${sessionId}.json`);
}

function readState(logdir, sessionId) {
  const f = stateFilePath(logdir, sessionId);
  if (!fs.existsSync(f)) return null;
  return JSON.parse(fs.readFileSync(f, 'utf8'));
}

function writeState(logdir, state) {
  fs.mkdirSync(logdir, { recursive: true });
  fs.writeFileSync(stateFilePath(logdir, state.sessionId), JSON.stringify(state, null, 2));
}

function clearState(logdir, sessionId) {
  const f = stateFilePath(logdir, sessionId);
  if (fs.existsSync(f)) fs.unlinkSync(f);
}

function makeLogBase(logdir, name) {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const stamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
  const suffix = name ? `-${name.replace(/[^a-zA-Z0-9._-]/g, '_')}` : '';
  return path.join(logdir, `${stamp}-conversation${suffix}`);
}

function rawPathFor(logFile) {
  return logFile.replace(/\.md$/i, '.raw.md');
}

function sliceFromUuid(entries, startUuid) {
  const idx = entries.findIndex((e) => e.uuid === startUuid);
  return idx < 0 ? entries : entries.slice(idx);
}

function writeLog(state, entries) {
  const sliced = sliceFromUuid(entries, state.startUuid);
  const conversationMd = renderMarkdown(sliced, state, { conversationOnly: true });
  const rawMd = renderMarkdown(sliced, state, { conversationOnly: false });
  fs.mkdirSync(path.dirname(state.logFile), { recursive: true });
  fs.writeFileSync(state.logFile, conversationMd);
  fs.writeFileSync(rawPathFor(state.logFile), rawMd);
  return sliced.length;
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const logdir = await loadLogDir();
  const transcript = findTranscript(opts.session);
  const entries = readJsonl(transcript);

  if (opts.cmd === 'start') {
    const startUuid = resolveStartUuid(entries, { n: opts.n, all: opts.all });
    if (!startUuid) throw new Error('Could not resolve a start point in the transcript');
    const existing = readState(logdir, opts.session);
    const logFile = existing?.logFile ?? `${makeLogBase(logdir, opts.name)}.md`;
    const state = {
      sessionId: opts.session,
      logFile,
      startUuid,
      createdAt: new Date().toISOString(),
    };
    const count = writeLog(state, entries);
    if (opts.end) clearState(logdir, opts.session);
    else writeState(logdir, state);
    console.log(
      JSON.stringify(
        {
          action: 'start',
          logFile,
          rawLogFile: rawPathFor(logFile),
          startUuid,
          entries: count,
          ended: !!opts.end,
        },
        null,
        2
      )
    );
    return;
  }

  if (opts.cmd === 'refresh' || opts.cmd === 'end') {
    const state = readState(logdir, opts.session);
    if (!state) throw new Error(`No active log-conversation state for session ${opts.session}`);
    const count = writeLog(state, entries);
    if (opts.cmd === 'end') clearState(logdir, opts.session);
    console.log(
      JSON.stringify(
        {
          action: opts.cmd,
          logFile: state.logFile,
          rawLogFile: rawPathFor(state.logFile),
          entries: count,
        },
        null,
        2
      )
    );
    return;
  }

  if (opts.cmd === 'status') {
    const state = readState(logdir, opts.session);
    if (!state) {
      console.log(JSON.stringify({ active: false, sessionId: opts.session }));
      process.exit(1);
    }
    console.log(JSON.stringify({ active: true, ...state }, null, 2));
    return;
  }

  throw new Error(`Unknown command: ${opts.cmd}`);
}

main().catch((err) => {
  console.error(`log-conversation: ${err.message}`);
  process.exit(1);
});
