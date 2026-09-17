import type { Request } from "express";

/** One hop in a "what ran" list. `done` is real, `skip` is greyed out. */
export interface PageStep {
  title: string;
  tag: string;
  copy: string;
  mark: "done" | "idle" | "skip";
}

export function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

export function prefersHtml(req: Request): boolean {
  return String(req.headers.accept ?? "").includes("text/html");
}

function chromeCss(): string {
  return `
    :root { color-scheme: light; }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: ui-sans-serif, system-ui, sans-serif;
      background: #f7f7f4;
      color: #121317;
      line-height: 1.5;
    }
    main { max-width: 32rem; margin: 0 auto; padding: 2rem 1rem 3rem; }
    .kicker {
      font-size: 0.72rem;
      letter-spacing: 0.06em;
      text-transform: uppercase;
      color: #6b6d73;
      margin: 1.5rem 0 0.4rem;
    }
    .kicker:first-child { margin-top: 0; }
    h1 { font-size: 1.3rem; letter-spacing: -0.02em; margin: 0 0 0.5rem; }
    p { margin: 0 0 0.9rem; }
    .lede { color: #5c5e66; font-size: 0.92rem; }
    .note { color: #5c5e66; font-size: 0.82rem; }
    code { font-size: 0.78rem; background: #ecece7; padding: 0.05rem 0.25rem; border-radius: 3px; }
    a { color: #121317; }
    .card {
      padding: 1rem;
      background: #fff;
      border: 1px solid #e6e6e1;
      border-radius: 4px;
    }
    label { display: block; margin: 0.8rem 0 0.25rem; font-size: 0.8rem; color: #5c5e66; }
    input, select {
      width: 100%;
      height: 2.5rem;
      padding: 0 0.7rem;
      border: 1px solid #d6d6d0;
      border-radius: 4px;
      background: #fff;
      font: inherit;
    }
    button {
      margin-top: 1.1rem;
      width: 100%;
      height: 2.75rem;
      border: 0;
      border-radius: 4px;
      background: #121317;
      color: #fff;
      font: inherit;
      font-weight: 600;
    }
    .path { list-style: none; margin: 0; }
    .path li { padding: 0.7rem 0; border-top: 1px solid #ecece7; }
    .path li:first-child { border-top: 0; padding-top: 0; }
    .path li:last-child { padding-bottom: 0; }
    .step-head {
      display: flex;
      align-items: baseline;
      justify-content: space-between;
      gap: 1rem;
    }
    .step-title { font-size: 0.9rem; font-weight: 600; }
    .step-copy { display: block; margin-top: 0.15rem; color: #6b6d73; font-size: 0.8rem; }
    .path li.skip .step-title, .path li.skip .step-copy { color: #8a8c93; }
    .tag {
      flex: none;
      font-size: 0.68rem;
      letter-spacing: 0.04em;
      text-transform: uppercase;
      font-weight: 600;
      color: #6b6d73;
    }
    .path li.done .tag { color: #1f7a58; }
    dl { margin: 0; font-size: 0.9rem; }
    dl div { display: flex; justify-content: space-between; gap: 1rem; padding: 0.4rem 0; border-top: 1px solid #ecece7; }
    dl div:first-child { border-top: 0; padding-top: 0; }
    dt { color: #6b6d73; }
    dd { margin: 0; text-align: right; word-break: break-all; }
    pre {
      margin: 0;
      padding: 0.9rem;
      background: #fff;
      border: 1px solid #e6e6e1;
      border-radius: 4px;
      font-size: 0.72rem;
      line-height: 1.45;
      overflow: auto;
      color: #3d3f46;
    }
    .rows { list-style: none; margin: 0; }
    .rows li { padding: 0.6rem 0; border-top: 1px solid #ecece7; }
    .rows li:first-child { border-top: 0; padding-top: 0; }
    .rows li:last-child { padding-bottom: 0; }
  `;
}

export function shell(title: string, body: string): string {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)}</title>
  <style>${chromeCss()}</style>
</head>
<body>
  <main>
    ${body}
  </main>
</body>
</html>`;
}

export function stepsHtml(steps: PageStep[], label: string): string {
  const items = steps
    .map(
      (step) =>
        `<li class="${step.mark}"><div class="step-head"><span class="step-title">${escapeHtml(step.title)}</span><span class="tag">${escapeHtml(step.tag)}</span></div><span class="step-copy">${escapeHtml(step.copy)}</span></li>`,
    )
    .join("");
  return `<ol class="path card" aria-label="${escapeHtml(label)}">${items}</ol>`;
}

/** Key/value card. Rows with an empty value are dropped. */
export function definitionsHtml(rows: [string, string][]): string {
  const list = rows
    .filter(([, value]) => value !== "")
    .map(
      ([key, value]) =>
        `<div><dt>${escapeHtml(key)}</dt><dd>${escapeHtml(value)}</dd></div>`,
    )
    .join("");
  return `<dl class="card">${list}</dl>`;
}
