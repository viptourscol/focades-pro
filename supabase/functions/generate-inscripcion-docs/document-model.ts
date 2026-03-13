import type { DocTemplate } from './templates.ts';

export type RenderContext = {
  template: DocTemplate;
  formData: Record<string, unknown>;
  radicado: string;
  inscripcionId: string;
  signatureBytes: Uint8Array;
  logoBytes: Uint8Array | null;
  generatedAtLabel: string;
  tokens: Record<string, string>;
};
