import { readFileSync } from 'node:fs'

const PACKAGE_NAME = /^[a-z0-9][a-z0-9_-]*$/
const RUN_LIMITS = ['maxTargets', 'maxBudgetUsd', 'maxTurns']

const isPositive = (value) => typeof value === 'number' && value > 0
const isGlobList = (value) => Array.isArray(value) && value.every((glob) => typeof glob === 'string' && glob !== '')
const isNonEmptyGlobList = (value) => isGlobList(value) && value.length > 0

export function validateConfig(config) {
  const errors = []
  if (!/haiku/i.test(config?.model ?? '')) errors.push('model must be a Haiku model')
  const packages = Object.entries(config?.packages ?? {})
  if (packages.length === 0) errors.push('packages must define at least one package')
  for (const [name, settings] of packages) errors.push(...packageErrors(name, settings))
  const limits = config?.limits ?? {}
  const runLimitsValid = ['pr', 'sweep'].every((mode) => RUN_LIMITS.every((key) => isPositive(limits[mode]?.[key])))
  if (!runLimitsValid) errors.push('limits.pr and limits.sweep must set maxTargets, maxBudgetUsd and maxTurns')
  if (!isPositive(limits.maxPatchFiles) || !isPositive(limits.maxTestFileBytes)) {
    errors.push('limits.maxPatchFiles and limits.maxTestFileBytes must be positive numbers')
  }
  return errors
}

function packageErrors(name, settings) {
  if (!PACKAGE_NAME.test(name)) return [`package name ${name} must be a plain folder name`]
  const errors = []
  if (!isNonEmptyGlobList(settings?.sourceGlobs)) errors.push(`packages.${name}.sourceGlobs must be a non-empty array of globs`)
  if (!isGlobList(settings?.ignoreGlobs)) errors.push(`packages.${name}.ignoreGlobs must be an array of globs`)
  if (!isNonEmptyGlobList(settings?.testGlobs)) errors.push(`packages.${name}.testGlobs must be a non-empty array of globs`)
  if (!isNonEmptyGlobList(settings?.writableGlobs)) errors.push(`packages.${name}.writableGlobs must be a non-empty array of globs`)
  return errors
}

export function loadConfig(path) {
  const config = JSON.parse(readFileSync(path, 'utf8'))
  const errors = validateConfig(config)
  if (errors.length > 0) throw new Error(`Invalid test-agent config ${path}:\n- ${errors.join('\n- ')}`)
  return config
}
