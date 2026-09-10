import { PUBLIC_BASE_URL } from '../config.js';

export function renderStellarToml(
  template: string,
  input: {
    omnibusPublicKey?: string;
    merchantPublicKey?: string;
    publicBaseUrl?: string;
  },
): string {
  const base = (input.publicBaseUrl ?? PUBLIC_BASE_URL).replace(/\/$/, '');
  let body = template.replaceAll('{{PUBLIC_BASE_URL}}', base);
  if (input.omnibusPublicKey) {
    body = body.replace(/issuer = "[^"]+"/, `issuer = "${input.omnibusPublicKey}"`);
    body = body.replace(
      /ACCOUNTS=\[[^\]]*\]/,
      `ACCOUNTS=["${input.omnibusPublicKey}"${input.merchantPublicKey ? `, "${input.merchantPublicKey}"` : ''}]`,
    );
  }
  if (!body.includes('DOCUMENTATION')) {
    body += `\nDOCUMENTATION="https://github.com/lomiafrica/stellar/blob/main/docs/ARCHITECTURE.md"\n`;
  }
  return body;
}
