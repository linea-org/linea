import {
  db,
  decryptSecret,
  isEncryptedSecret,
  repositories,
  type Execution,
  type ExecutionStep,
} from '@linealabs/db'
import {
  redactRecord,
  redactText,
  redactValue,
  type KnownSecrets,
} from './trace-redaction'

const noSecrets: KnownSecrets = new Map()

/** The Environment's secret values, so a trace that echoes one shows its name instead. */
export async function environmentSecrets(
  environmentId: string | null,
): Promise<KnownSecrets> {
  if (!environmentId) return noSecrets
  const stored = await repositories.secret.listEncryptedSecrets(
    db,
    environmentId,
  )
  return new Map(
    stored.map(({ key, encryptedValue }) => [
      key,
      isEncryptedSecret(encryptedValue)
        ? decryptSecret(encryptedValue)
        : encryptedValue,
    ]),
  )
}

export function redactExecution<T extends Execution>(
  execution: T,
  secrets: KnownSecrets = noSecrets,
): T {
  return {
    ...execution,
    output: redactValue(execution.output, secrets),
    triggerPayload:
      execution.triggerPayload &&
      redactRecord(execution.triggerPayload, secrets),
    error: execution.error && {
      ...execution.error,
      message: redactText(execution.error.message, secrets),
    },
  }
}

/** A step records whatever its node received and returned, which need not be an object. */
export type RedactedStep = Omit<ExecutionStep, 'input' | 'output'> & {
  input: unknown
  output: unknown
}

export function redactStep(
  step: ExecutionStep,
  secrets: KnownSecrets,
): RedactedStep {
  return {
    ...step,
    input: redactValue(step.input, secrets),
    output: redactValue(step.output, secrets),
    attributes: step.attributes && redactRecord(step.attributes, secrets),
    error: step.error && {
      ...step.error,
      message: redactText(step.error.message, secrets),
    },
  }
}
