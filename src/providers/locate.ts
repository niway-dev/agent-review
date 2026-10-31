/**
 * Where the files are, for an agent whose session does not start in the pull request's head.
 *
 * Both adapters start the agent in an empty scratch directory so that nothing in the head (a
 * `CLAUDE.md`, an `AGENTS.md`, a skill, a settings file) is discovered as instructions. The
 * engine's own prompt refers to head files by repository-relative name, so the model is told the
 * absolute location of the head and of the scratch files here.
 */
export function locatePrompt(prompt: string, repoDir: string, addDirs: string[], opts: { shell: boolean }) {
  const extra = addDirs.length > 0 ? ` The scratch files the prompt mentions are under ${addDirs.join(", ")}.` : "";
  const how = opts.shell
    ? "read files there by absolute path, or cd into it at the start of each command"
    : "read files there by their absolute path (the repository root followed by the relative path)";
  return `The repository to review is checked out at ${repoDir}. Every relative path below is relative to it: ${how}. When you report a path, give it relative to the repository root, never absolute.${extra} Only read: never build, test or run the repository's code.\n\n${prompt}`;
}
