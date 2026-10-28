import { test } from 'node:test'
import assert from 'node:assert/strict'
import { nonHaikuModels, summarizeTranscript } from '../lib/transcript.mjs'

const toolUse = (name, input) => ({ type: 'tool_use', name, input })
const LINES = [
  { type: 'system', subtype: 'init', model: 'claude-haiku-5-5' },
  {
    type: 'assistant',
    message: { model: 'claude-haiku-5-5', content: [toolUse('Skill', { skill: 'analyze-changes' }), toolUse('Read', { file_path: 'a.ts' })] },
  },
  { type: 'user', message: { content: [{ type: 'tool_result', is_error: true, content: 'boom' }] } },
  {
    type: 'assistant',
    message: {
      model: 'claude-haiku-5-5',
      content: [{ type: 'text', text: 'Done' }, toolUse('Skill', { skill: 'run-tests' }), toolUse('Skill', { skill: 'analyze-changes' })],
    },
  },
  {
    type: 'result',
    subtype: 'success',
    is_error: false,
    num_turns: 7,
    total_cost_usd: 0.0123,
    duration_ms: 45000,
    modelUsage: { 'claude-haiku-5-5': { costUSD: 0.0123 } },
    permission_denials: [{ tool_name: 'Edit', tool_input: { file_path: 'backend/src/a.ts' } }, { tool_name: 'WebFetch', tool_input: {} }],
    structured_output: { decisions: [], summary: 'ok' },
  },
].map((line) => JSON.stringify(line))

test('summarizes the run: status, cost, models, skills, tool use and the structured report', () => {
  assert.deepEqual(summarizeTranscript([...LINES.slice(0, 2), 'not json', ...LINES.slice(2)]), {
    status: 'success',
    isError: false,
    turns: 7,
    costUsd: 0.0123,
    durationMs: 45000,
    models: ['claude-haiku-5-5'],
    skills: ['analyze-changes', 'run-tests'],
    toolCalls: { Skill: 3, Read: 1 },
    toolErrors: 1,
    deniedTools: ['Edit backend/src/a.ts', 'WebFetch'],
    report: { decisions: [], summary: 'ok' },
  })
})

test('collects models from assistant messages even without a result line', () => {
  const summary = summarizeTranscript(LINES.slice(0, 2))
  assert.equal(summary.status, 'missing')
  assert.equal(summary.report, null)
  assert.deepEqual(summary.models, ['claude-haiku-5-5'])
})

test('nonHaikuModels lists every model outside the Haiku family', () => {
  assert.deepEqual(nonHaikuModels(['claude-haiku-5-5', 'claude-sonnet-5-5', 'claude-haiku-4-5-20251001']), ['claude-sonnet-5-5'])
  assert.deepEqual(nonHaikuModels([]), [])
})
