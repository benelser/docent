// docent survey — the URL fetcher for explainer mode.
//
// Explainer mode (`ex`) can survey a remote page — a blog post, an essay, a
// wiki article. The agent reads files, not URLs, so we fetch the page once and
// land it as readable Markdown-ish text at analysis/<id>.source.md. The agent
// then surveys that file the way it would survey a local document.
//
// This is deliberately *not* a headless browser. It does a single HTTP GET and
// extracts text from server-rendered HTML. A JS-heavy SPA whose content is
// injected client-side will yield a near-empty body; we detect that and write
// an explicit limitation note into the file rather than failing — the agent is
// told to treat that as a degraded source and survey what it can.

import {writeFileSync} from 'node:fs';

export type FetchResult = {
  path: string; // where the source was written
  ok: boolean; // true if usable readable text was extracted
  bytes: number; // size of the extracted text
  note?: string; // a limitation note, when the page looked like an empty SPA shell
};

// Strip a server-rendered HTML document down to readable text. Best-effort and
// dependency-free: drop non-content elements, unwrap tags, decode the common
// entities, collapse whitespace. Block-level tags become paragraph breaks so
// the structure of the prose survives.
const htmlToText = (html: string): string => {
  let s = html;
  // Kill everything that is not prose.
  s = s.replace(/<!--[\s\S]*?-->/g, '');
  s = s.replace(/<(script|style|noscript|svg|head|nav|footer|form|iframe)\b[\s\S]*?<\/\1>/gi, '');
  // Headings — keep them, mark them so the agent sees the document outline.
  s = s.replace(/<h([1-6])[^>]*>([\s\S]*?)<\/h\1>/gi, (_m, lvl, inner) => {
    const hashes = '#'.repeat(Number(lvl));
    return `\n\n${hashes} ${inner}\n\n`;
  });
  // List items.
  s = s.replace(/<li[^>]*>/gi, '\n- ').replace(/<\/li>/gi, '');
  // Block-level boundaries become blank lines.
  s = s.replace(/<\/(p|div|section|article|ul|ol|blockquote|pre|tr|table)>/gi, '\n\n');
  s = s.replace(/<br\s*\/?>/gi, '\n');
  // Drop every remaining tag.
  s = s.replace(/<[^>]+>/g, '');
  // Decode the entities that actually show up in prose.
  s = s
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&mdash;/g, '—')
    .replace(/&ndash;/g, '–')
    .replace(/&hellip;/g, '…')
    .replace(/&#(\d+);/g, (_m, n) => String.fromCodePoint(Number(n)));
  // Collapse runaway whitespace.
  s = s.replace(/[ \t]+/g, ' ');
  s = s.replace(/\n{3,}/g, '\n\n');
  return s.trim();
};

// Pull <title> and the meta description, for a header the agent can anchor on.
const metaOf = (html: string): {title?: string; description?: string} => {
  const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.trim();
  const description = html.match(
    /<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)["']/i,
  )?.[1]?.trim();
  return {title, description};
};

// docent's fetcher does one thing: it fetches a URL and tells you what came
// back (chars, format, title). It does NOT know about specific hosts,
// abstract vs. full text, or which surface is "better" for a paper. That
// intelligence lives in the skill — the agent reads the docent-explain
// brief, sees the URL, knows the patterns of arxiv/biorxiv/etc., and
// retries with an alternate URL if the first fetch is thin. The engine
// just transports bytes.
//
// Two things the engine *does* need to know, because they're format
// concerns the agent can't paper over:
//
//   URL_LOOKS_PDF: any URL ending in .pdf is a binary; don't run it
//                  through the HTML parser. Cheap pre-fetch check.
//   RESPONSE_IS_PDF: the same fact after the HTTP call. Hosts that
//                    serve PDFs without a .pdf suffix (the only common
//                    example today is arxiv.org/pdf/<id>) are caught
//                    here by Content-Type, not by URL pattern.
//
// These are the only host-agnostic facts the engine cares about. Everything
// else — "this looked like an abstract stub, try the full text URL" — is
// the skill's job.
const URL_LOOKS_PDF = (url: string): boolean => /\.pdf(?:$|\?|#)/i.test(url);
const RESPONSE_IS_PDF = (res: Response): boolean =>
  /^application\/pdf\b/i.test(res.headers.get('content-type') ?? '');

const fetchAsPdf = async (
  url: string,
  dest: string,
  prefetched?: Response,
): Promise<{text: string; title: string; description: string}> => {
  // `pdftotext` is the workhorse; this code path is skipped for HTML.
  // Caller may pass an already-fetched Response (from the Content-Type
  // sniff in fetchSource) so we don't re-download the same bytes.
  const pdfDest = dest.replace(/\.[^.]+$/, '') + '.pdf';
  const res = prefetched ?? await fetch(url, {
    redirect: 'follow',
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
        '(KHTML, like Gecko) Chrome/124.0 Safari/537.36',
      Accept: 'application/pdf,*/*',
    },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
  const buf = await res.arrayBuffer();
  await Bun.write(pdfDest, buf);
  // Convert with pdftotext if present. The flag `-layout` preserves column
  // structure on academic papers; `-` writes to stdout.
  if (!Bun.which('pdftotext')) {
    throw new Error(
      `pdftotext not on PATH — install poppler (brew install poppler / apt-get install poppler-utils) for PDF sources`,
    );
  }
  const proc = Bun.spawn(['pdftotext', '-layout', pdfDest, '-'], {
    stdout: 'pipe',
    stderr: 'pipe',
  });
  const text = await new Response(proc.stdout).text();
  await proc.exited;
  if (proc.exitCode !== 0) {
    const err = await new Response(proc.stderr).text();
    throw new Error(`pdftotext failed: ${err.slice(0, 200)}`);
  }
  // The first non-empty line of the extracted PDF is usually the paper
  // title. arXiv PDFs in particular put the title on line 1.
  const firstLine = text.split('\n').map((l) => l.trim()).find((l) => l.length > 5);
  return {
    text,
    title: firstLine ? firstLine.slice(0, 180) : url,
    description: '',
  };
};

export const fetchSource = async (url: string, dest: string): Promise<FetchResult> => {
  // Pre-fetch PDF fast-path — when the URL itself ends in .pdf we know
  // before the request that this is a binary. Saves a round trip of
  // 'fetch HTML, discover Content-Type is application/pdf, refetch as PDF'.
  if (URL_LOOKS_PDF(url)) {
    process.stdout.write(`\x1b[2m   pdf source — extracting with pdftotext\x1b[0m\n`);
    const {text, title, description} = await fetchAsPdf(url, dest);
    const header = [
      `# ${title || url}`,
      '',
      `<!-- source: ${url} -->`,
      `<!-- fetched: ${new Date().toISOString()} -->`,
      `<!-- format: pdf -->`,
      '',
    ].join('\n');
    await Bun.write(dest, header + text);
    return {url, finalUrl: url, title, description, length: text.length};
  }

  let html: string;
  let finalUrl = url;
  const fetchUrl = url;
  try {
    const res = await fetch(fetchUrl, {
      redirect: 'follow',
      headers: {
        // Some hosts serve a stub to unknown agents; present as a real browser.
        'User-Agent':
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
          '(KHTML, like Gecko) Chrome/124.0 Safari/537.36',
        // Accept both HTML and PDF — many hosts redirect from an HTML
        // URL to a PDF (e.g. arxiv.org/pdf/<id> serves application/pdf
        // without a .pdf extension). The Content-Type sniff below routes
        // to the right code path regardless of URL shape.
        Accept: 'text/html,application/xhtml+xml,application/pdf;q=0.9,*/*;q=0.5',
      },
    });
    finalUrl = res.url || url;
    if (!res.ok) {
      throw new Error(`HTTP ${res.status} ${res.statusText}`);
    }

    // Content-Type sniff — the authoritative signal that the URL we
    // thought was HTML is actually a PDF. Hand the live Response over
    // to fetchAsPdf so we don't re-download the same bytes.
    if (RESPONSE_IS_PDF(res)) {
      process.stdout.write(
        `\x1b[2m   content-type: application/pdf — extracting with pdftotext\x1b[0m\n`,
      );
      const {text, title, description} = await fetchAsPdf(finalUrl, dest, res);
      const header = [
        `# ${title || finalUrl}`,
        '',
        `<!-- source: ${url} -->`,
        `<!-- fetched: ${new Date().toISOString()} -->`,
        `<!-- format: pdf -->`,
        '',
      ].join('\n');
      await Bun.write(dest, header + text);
      return {url: fetchUrl, finalUrl, title, description, length: text.length};
    }

    html = await res.text();
  } catch (e) {
    throw new Error(`could not fetch ${url}: ${e instanceof Error ? e.message : String(e)}`);
  }

  const {title, description} = metaOf(html);
  const text = htmlToText(html);

  // An SPA shell: the HTTP body has scripts and a mount point but little prose.
  // We do not run a browser — we land what we have and flag it loudly so the
  // agent treats the source as degraded rather than authoritative.
  const SPA_FLOOR = 600; // chars of readable text below which we suspect a shell
  const looksEmpty = text.length < SPA_FLOOR;
  const note = looksEmpty
    ? `This page returned only ${text.length} characters of readable text from a ` +
      `plain HTTP fetch — its content is likely rendered client-side by JavaScript. ` +
      `docent does not run a headless browser. Survey what is present below; if it ` +
      `is insufficient, say so explicitly in the survey and narrow the film's claim ` +
      `to what the source actually supports.`
    : undefined;

  const header = [
    `<!-- docent explainer source -->`,
    `<!-- fetched: ${new Date().toISOString()} -->`,
    `<!-- url: ${finalUrl} -->`,
    title ? `# ${title}` : `# ${finalUrl}`,
    description ? `\n_${description}_` : '',
    note ? `\n> LIMITATION: ${note}` : '',
    `\n---\n`,
  ]
    .filter(Boolean)
    .join('\n');

  const body = `${header}\n${text}\n`;
  writeFileSync(dest, body, 'utf8');
  return {path: dest, ok: !looksEmpty, bytes: text.length, note};
};
