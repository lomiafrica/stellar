import type { Request } from "express";

export type TagTone = "pass" | "fail" | "mock" | "lomi" | "chain";

/** One hop in a "what ran" list. `done` is real, `skip` is greyed out. */
export interface PageStep {
  title: string;
  tag: string;
  copy: string;
  mark: "done" | "idle" | "skip";
  tone?: TagTone;
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
    main { max-width: 40rem; margin: 0 auto; padding: 1.25rem 1.1rem 2.25rem; }
    .kicker {
      font-size: 0.7rem;
      letter-spacing: 0.06em;
      text-transform: uppercase;
      color: #6b6d73;
      margin: 1.05rem 0 0.3rem;
    }
    .kicker:first-child { margin-top: 0; }
    h1 { font-size: 1.28rem; letter-spacing: -0.02em; margin: 0 0 0.35rem; }
    p { margin: 0 0 0.7rem; }
    .lede { color: #5c5e66; font-size: 0.9rem; }
    .note { color: #5c5e66; font-size: 0.8rem; }
    code { font-size: 0.78rem; background: #ecece7; padding: 0.05rem 0.25rem; border-radius: 3px; }
    a { color: #121317; }
    dd a { color: #1d6fd6; }
    .card {
      padding: 0.8rem 1rem;
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
    form button {
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
    .path li { padding: 0.45rem 0; border-top: 1px solid #ecece7; }
    .path li:first-child { border-top: 0; padding-top: 0; }
    .path li:last-child { padding-bottom: 0; }
    .step-head {
      display: flex;
      align-items: baseline;
      justify-content: space-between;
      gap: 1rem;
    }
    .step-title { font-size: 0.88rem; font-weight: 600; }
    .step-copy { display: block; margin-top: 0.08rem; color: #6b6d73; font-size: 0.78rem; }
    .path li.skip .step-title, .path li.skip .step-copy { color: #8a8c93; }
    .tag {
      flex: none;
      font-size: 0.66rem;
      letter-spacing: 0.04em;
      text-transform: uppercase;
      font-weight: 600;
      color: #6b6d73;
    }
    .tag.pass { color: #1f7a58; }
    .tag.fail { color: #c43818; }
    .tag.mock { color: #8a8c93; }
    .tag.lomi { color: #c45a12; }
    .tag.chain { color: #1d6fd6; }
    .status-ok { color: #1f7a58; font-weight: 600; }
    .status-bad { color: #c43818; font-weight: 600; }
    .status-wait { color: #c45a12; font-weight: 600; }
    dl { margin: 0; font-size: 0.88rem; }
    dl div { display: flex; justify-content: space-between; align-items: baseline; gap: 1rem; padding: 0.32rem 0; border-top: 1px solid #ecece7; }
    dl div:first-child { border-top: 0; padding-top: 0; }
    dt { color: #6b6d73; display: flex; align-items: center; gap: 0.35rem; }
    dd { margin: 0; text-align: right; word-break: break-all; }
    .tip {
      position: relative;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 0.95rem;
      height: 0.95rem;
      margin: 0;
      border: 1px solid #c9cac4;
      border-radius: 99px;
      background: #fff;
      color: #5c5e66;
      font: 700 0.62rem/1 ui-sans-serif, system-ui, sans-serif;
      cursor: help;
    }
    .tip-bubble {
      display: none;
      position: absolute;
      left: 0;
      top: calc(100% + 0.4rem);
      z-index: 2;
      width: 16.5rem;
      padding: 0.55rem 0.65rem;
      background: #121317;
      color: #f7f7f4;
      font-size: 0.75rem;
      font-weight: 400;
      letter-spacing: 0;
      text-transform: none;
      line-height: 1.4;
      border-radius: 4px;
      text-align: left;
    }
    .tip:hover .tip-bubble, .tip:focus .tip-bubble, .tip.open .tip-bubble { display: block; }
    pre {
      margin: 0;
      padding: 0.75rem;
      background: #fff;
      border: 1px solid #e6e6e1;
      border-radius: 4px;
      font-size: 0.7rem;
      line-height: 1.4;
      overflow: auto;
      color: #3d3f46;
    }
    details.raw { margin-top: 0.55rem; }
    details.raw summary {
      cursor: pointer;
      color: #6b6d73;
      font-size: 0.78rem;
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

export function infoTip(label: string, text: string): string {
  return `<span class="tip" tabindex="0" role="note" aria-label="${escapeHtml(label)}">i<span class="tip-bubble">${escapeHtml(text)}</span></span>`;
}

export function stepsHtml(steps: PageStep[], label: string): string {
  const items = steps
    .map((step) => {
      const tone = step.tone ? ` ${step.tone}` : "";
      return `<li class="${step.mark}"><div class="step-head"><span class="step-title">${escapeHtml(step.title)}</span><span class="tag${tone}">${escapeHtml(step.tag)}</span></div><span class="step-copy">${escapeHtml(step.copy)}</span></li>`;
    })
    .join("");
  return `<ol class="path card" aria-label="${escapeHtml(label)}">${items}</ol>`;
}

export type DefinitionRow = {
  key: string;
  value: string;
  html?: boolean;
  tip?: string;
};

/** Key/value card. Rows with an empty value are dropped. */
export function definitionsHtml(
  rows: Array<DefinitionRow | [string, string]>,
): string {
  const list = rows
    .map((row) => (Array.isArray(row) ? { key: row[0], value: row[1] } : row))
    .filter((row) => row.value !== "")
    .map((row) => {
      const tip = row.tip ? infoTip(row.key, row.tip) : "";
      const value = row.html ? row.value : escapeHtml(row.value);
      return `<div><dt>${escapeHtml(row.key)}${tip}</dt><dd>${value}</dd></div>`;
    })
    .join("");
  return `<dl class="card">${list}</dl>`;
}
