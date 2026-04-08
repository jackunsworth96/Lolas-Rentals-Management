# GitHub Actions workflows

## `security-audit.yml`

Runs on every **pull request targeting `main`**, and on **pushes to `main`** except when the only changed files are under the ignored paths (see below).

**Push path filter:** Pushes to `main` that **only** modify `SECURITY.md` do **not** run this workflow. That avoids an infinite loop when the `update-security-md` job commits automated npm audit results back to `main`. Pushes that change any other file (including together with `SECURITY.md`) still run the full workflow.

### Jobs

| Job | Purpose |
|-----|---------|
| **npm-audit** | Installs dependencies in `apps/api` with `npm ci`, runs `npm audit --audit-level=moderate`, saves output to `audit-output.txt`, and uploads it as an artifact. The step is allowed to fail without failing the job (`continue-on-error`), so the workflow still completes and artifacts are still produced when vulnerabilities are reported. |
| **secret-scan** | Uses [TruffleHog OSS](https://github.com/trufflesecurity/trufflehog) (`trufflesecurity/trufflehog@main`) to look for accidentally committed secrets. On **pull requests**, it scans the git range between the PR base and head (the PR diff). On **push to `main`**, it scans from the repository’s root commit through `HEAD` (full history on the branch). **This job fails the workflow if verified secrets are found.** |
| **update-security-md** | Runs only on **push to `main`**, after `npm-audit` finishes. Downloads the audit artifact, updates `**Last scanned (CI):**` in `SECURITY.md`, and creates or replaces the `## Automated Scan Results` section with a severity table and the full npm audit log (in a collapsible `<details>` block). Commits and pushes with the `github-actions[bot]` identity. |

### How to read the security scan results

1. Open the **Actions** tab in GitHub and select the **Security audit** workflow run.
2. **npm audit:** Open the **npm audit (apps/api)** job and expand **Install dependencies and run npm audit** to see the console log. After a push to `main`, open **`SECURITY.md`** on `main` and scroll to **Automated Scan Results** for the persisted summary and full output.
3. **TruffleHog:** Open the **Secret scan (TruffleHog)** job. If it failed, the log lists findings (redacted in logs depending on configuration). Fix by rotating any exposed credentials and removing secrets from history if they were committed (consider `git filter-repo` or support from your platform team).

### How to fix npm audit vulnerabilities

1. **Reproduce locally**

   ```bash
   cd apps/api
   npm ci
   npm audit
   ```

2. **Apply fixes**

   - Prefer **`npm audit fix`** for safe semver-compatible updates.
   - Use **`npm audit fix --force`** only when you understand the breaking changes it may introduce.
   - If no automatic fix exists, upgrade the affected package manually in `package.json` / `package-lock.json`, then re-run `npm audit`.

3. **Decide on exceptions**

   - If a finding is a false positive or accepted risk, document it and consider **`npm audit --omit=dev`** only for production-focused checks (not as a permanent ignore without review).
   - Do not commit `.npmrc` overrides that disable auditing without team approval.

4. **Re-run CI**

   Push your changes; the workflow will refresh **Automated Scan Results** on the next successful push to `main`.

---

*Update this README when workflows are added or changed.*
