/**
 * The publish gate from SPEC §6.8: "Validate (line-index parity, no timestamp
 * regressions, duration match within 500ms) then publish."
 *
 * Parsing catches problems inside one document. This catches problems *between*
 * documents — a translation that lost a line, a romanisation retimed by hand
 * against a stale mix — which is the class of error that silently ships a song
 * whose English gloss is one line ahead of the Yoruba it glosses.
 */

import type { LyricDocument, LyricIssue, LyricVariant } from './types';

/** SPEC §6.8. */
export const DURATION_TOLERANCE_MS = 500;

/**
 * How far a variant's line may sit from the same line in the reference variant
 * before we call it a retiming error. Variants are generated from one
 * arrangement and should be identical to the millisecond; a small tolerance
 * exists only so a hand-corrected file is not rejected over rounding.
 */
export const VARIANT_TIMING_TOLERANCE_MS = 20;

export interface VariantSet {
  /** The variant every other one is checked against. */
  readonly reference: LyricVariant;
  readonly documents: ReadonlyMap<LyricVariant, LyricDocument>;
}

export interface ValidationInput extends VariantSet {
  /** Duration of the audio asset these lyrics belong to, ms. */
  readonly audioDurationMs: number;
}

export function validateVariantSet(
  input: ValidationInput,
): readonly LyricIssue[] {
  const issues: LyricIssue[] = [];
  const reference = input.documents.get(input.reference);

  if (reference === undefined) {
    return [
      {
        severity: 'error',
        code: 'line-count-mismatch',
        message: `Reference variant '${input.reference}' is missing`,
      },
    ];
  }

  for (const [variant, document] of input.documents) {
    if (variant === input.reference) {
      continue;
    }
    compareToReference(input.reference, reference, variant, document, issues);
  }

  for (const [variant, document] of input.documents) {
    const lastLine = document.lines.at(-1);
    if (lastLine === undefined) {
      continue;
    }
    const overshoot = lastLine.endMs - input.audioDurationMs;
    if (overshoot > DURATION_TOLERANCE_MS) {
      issues.push({
        severity: 'error',
        code: 'duration-mismatch',
        message:
          `Variant '${variant}' ends ${Math.round(overshoot)}ms past the end of ` +
          `the audio (${input.audioDurationMs}ms)`,
      });
    }
  }

  return issues;
}

function compareToReference(
  referenceName: LyricVariant,
  reference: LyricDocument,
  variantName: LyricVariant,
  variant: LyricDocument,
  issues: LyricIssue[],
): void {
  if (variant.lines.length !== reference.lines.length) {
    issues.push({
      severity: 'error',
      code: 'line-count-mismatch',
      message:
        `Variant '${variantName}' has ${variant.lines.length} lines but ` +
        `'${referenceName}' has ${reference.lines.length}; line indices must ` +
        'match across variants',
    });
    // Comparing line by line past this point produces a cascade of noise that
    // buries the one fact that matters.
    return;
  }

  for (let index = 0; index < reference.lines.length; index += 1) {
    const expected = reference.lines[index];
    const actual = variant.lines[index];
    if (expected === undefined || actual === undefined) {
      continue;
    }
    if (expected.kind !== actual.kind) {
      issues.push({
        severity: 'error',
        code: 'line-count-mismatch',
        message:
          `Line ${index} is '${expected.kind}' in '${referenceName}' but ` +
          `'${actual.kind}' in '${variantName}'`,
        sourceLine: actual.sourceLine,
      });
      continue;
    }
    const drift = Math.abs(actual.startMs - expected.startMs);
    if (drift > VARIANT_TIMING_TOLERANCE_MS) {
      issues.push({
        severity: 'error',
        code: 'line-timing-mismatch',
        message:
          `Line ${index} starts ${Math.round(drift)}ms away from the same line ` +
          `in '${referenceName}'`,
        sourceLine: actual.sourceLine,
      });
    }
  }
}
