import { describe, expect, it } from "vitest"
import {
  connectorAccessPolicySchema,
  githubRepositoryAllowed,
  githubRepositoryTargetSchema,
} from "../src/resources/connector-access-policy"

describe("GitHub repository policy", () => {
  it.each([".", ".."])("rejects URL dot segments: %s", (segment) => {
    expect(
      githubRepositoryTargetSchema.safeParse({
        owner: segment,
        repository: "widgets",
      }).success
    ).toBe(false)
    expect(
      githubRepositoryTargetSchema.safeParse({
        owner: "acme",
        repository: segment,
      }).success
    ).toBe(false)
  })
  it("normalizes Operator repository names", () => {
    const policy = connectorAccessPolicySchema.parse({
      providers: [
        {
          provider: "github",
          actionFamilies: ["issues"],
          maxScopes: ["repo"],
          allowedRepositories: [{ owner: "Acme", repository: "Widgets" }],
        },
      ],
    })
    expect(policy.providers[0]?.allowedRepositories).toEqual([
      { owner: "acme", repository: "widgets" },
    ])
    expect(
      githubRepositoryAllowed(policy.providers[0]?.allowedRepositories, {
        owner: "ACME",
        repository: "WIDGETS",
      })
    ).toBe(true)
  })
  it.each([undefined, []])(
    "denies missing and empty lists: %s",
    (repositories) => {
      expect(
        githubRepositoryAllowed(repositories, {
          owner: "acme",
          repository: "widgets",
        })
      ).toBe(false)
    }
  )
  it.each(["acme/other", "other/widgets", "acme/widgets/extra", "acme/*"])(
    "denies unrelated or malformed targets: %s",
    (name) => {
      const [owner, repository] = name.split("/")
      expect(
        githubRepositoryAllowed([{ owner: "acme", repository: "widgets" }], {
          owner,
          repository: name.split("/").length === 2 ? repository : name,
        })
      ).toBe(false)
    }
  )
})
