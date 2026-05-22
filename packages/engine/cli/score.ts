// `docent score` — the triggering decision matrix. Cheap: GitHub metadata
// only, no agent, no render. Classifies a PR as skip / glance / full so a
// developer (or an advisory bot) knows whether a film is worth the wall time.

export type Tier = 'skip' | 'glance' | 'full';

export type Score = {
  repo: string;
  pr: number;
  title: string;
  files: number;
  logicFiles: number;
  logicLines: number;
  subsystems: number;
  generatedRatio: number;
  tier: Tier;
  reasons: string[];
};

// Lockfiles, generated code, vendored trees — churn that is not worth a film.
const GENERATED =
  /(^|\/)(.*\.lock|.*lock\.json|.*\.sum|go\.mod|.*\.pb\.go|.*_pb2\.py|.*\.generated\..*|.*\.min\..*)$|(^|\/)(vendor|node_modules|dist|third_party)\//;

export const scorePr = async (repo: string, pr: number): Promise<Score> => {
  const proc = Bun.spawn(
    ['gh', 'pr', 'view', String(pr), '--repo', repo, '--json', 'title,files,additions,deletions'],
    {stdout: 'pipe', stderr: 'pipe', env: {...process.env, GITHUB_TOKEN: ''}},
  );
  const code = await proc.exited;
  if (code !== 0) {
    const err = (await new Response(proc.stderr).text()).trim();
    throw new Error(`gh pr view ${repo}#${pr} failed: ${err || 'unknown error'}`);
  }
  const data = JSON.parse(await new Response(proc.stdout).text()) as {
    title?: string;
    files?: {path: string; additions?: number; deletions?: number}[];
  };
  const files = data.files ?? [];

  let logicLines = 0;
  let generatedLines = 0;
  let logicFiles = 0;
  const subsystems = new Set<string>();
  for (const f of files) {
    const churn = (f.additions ?? 0) + (f.deletions ?? 0);
    if (GENERATED.test(f.path)) {
      generatedLines += churn;
    } else {
      logicLines += churn;
      logicFiles += 1;
      subsystems.add(f.path.split('/')[0] ?? '');
    }
  }
  const totalChurn = logicLines + generatedLines;
  const generatedRatio = totalChurn ? generatedLines / totalChurn : 0;

  const reasons: string[] = [];
  let tier: Tier;
  if (generatedRatio > 0.9) {
    tier = 'skip';
    reasons.push(`${(generatedRatio * 100).toFixed(0)}% generated / lockfile churn`);
  } else if (logicFiles <= 2 && logicLines <= 80) {
    tier = 'skip';
    reasons.push(`small and single-purpose — ${logicFiles} files, ${logicLines} logic lines`);
  } else if (logicFiles > 15 || logicLines > 600 || subsystems.size >= 3) {
    tier = 'full';
    reasons.push(
      `${logicFiles} files · ${logicLines} logic lines · ${subsystems.size} subsystems — the wall-of-text case`,
    );
  } else {
    tier = 'glance';
    reasons.push(`${logicFiles} files · ${logicLines} logic lines · ${subsystems.size} subsystem(s)`);
  }

  return {
    repo,
    pr,
    title: data.title ?? '',
    files: files.length,
    logicFiles,
    logicLines,
    subsystems: subsystems.size,
    generatedRatio,
    tier,
    reasons,
  };
};
