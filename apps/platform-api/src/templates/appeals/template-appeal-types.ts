import type { TemplateAppealTypeId } from '@linea/db'

type AppealTypeDefinition = {
  /** What the author picks. */
  label: string
  /** Prompts the message; shown beneath the choice. */
  hint: string
  /** Types that cannot be judged without the author's words. */
  messageRequired: boolean
}

/** Typed against the database enum, so a new appeal type cannot be added without its wording. */
const definitions: Record<TemplateAppealTypeId, AppealTypeDefinition> = {
  not_a_violation: {
    label: "It doesn't break the rules",
    hint: 'Say why the template is fine to share.',
    messageRequired: true,
  },
  credentials_rotated: {
    label: "I've revoked the credentials in it",
    hint: 'Optional: which credentials, and when they were revoked.',
    messageRequired: false,
  },
  reported_in_bad_faith: {
    label: 'The reports were made in bad faith',
    hint: 'Say what makes you think so.',
    messageRequired: true,
  },
  automatic_hide_review: {
    label: 'It was hidden automatically, please review it',
    hint: 'Optional: anything that helps the review.',
    messageRequired: false,
  },
  other: {
    label: 'Something else',
    hint: 'Describe your appeal.',
    messageRequired: true,
  },
}

export function appealTypeDefinition(id: TemplateAppealTypeId) {
  return definitions[id]
}

export function listAppealTypes() {
  return (Object.keys(definitions) as TemplateAppealTypeId[]).map((id) => ({
    id,
    ...definitions[id],
  }))
}
