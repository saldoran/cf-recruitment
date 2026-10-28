// Summarizes a Claude Code stream-json transcript. The workflow reports these facts instead of
// trusting the agent's own words: the models billed, the skills it loaded, the tools it called.
export function summarizeTranscript(lines) {
  const models = new Set()
  const skills = []
  const toolCalls = {}
  let toolErrors = 0
  let result = null
  for (const event of lines.map(parseLine).filter(Boolean)) {
    if (event.type === 'assistant') {
      if (event.message?.model) models.add(event.message.model)
      for (const block of contentBlocks(event)) {
        if (block.type !== 'tool_use') continue
        toolCalls[block.name] = (toolCalls[block.name] ?? 0) + 1
        const skill = block.name === 'Skill' ? block.input?.skill : null
        if (skill && !skills.includes(skill)) skills.push(skill)
      }
    } else if (event.type === 'user') {
      toolErrors += contentBlocks(event).filter((block) => block.type === 'tool_result' && block.is_error).length
    } else if (event.type === 'result') {
      result = event
    }
  }
  for (const model of Object.keys(result?.modelUsage ?? {})) models.add(model)
  return {
    status: result?.subtype ?? 'missing',
    isError: result ? Boolean(result.is_error) : true,
    turns: result?.num_turns ?? 0,
    costUsd: result?.total_cost_usd ?? 0,
    durationMs: result?.duration_ms ?? 0,
    models: [...models],
    skills,
    toolCalls,
    toolErrors,
    deniedTools: (result?.permission_denials ?? []).map(describeDenial),
    report: result?.structured_output ?? null,
  }
}

export function nonHaikuModels(models) {
  return models.filter((model) => !/haiku/i.test(model))
}

function parseLine(line) {
  try {
    return JSON.parse(line)
  } catch {
    return null
  }
}

function contentBlocks(event) {
  const content = event.message?.content
  return Array.isArray(content) ? content.filter((block) => block && typeof block === 'object') : []
}

function describeDenial({ tool_name: tool, tool_input: input = {} }) {
  const target = input.file_path ?? input.command ?? input.url ?? ''
  return target ? `${tool} ${target}` : tool
}
