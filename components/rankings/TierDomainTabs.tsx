'use client';

// Tiers and Domains tabs — twin thin wrappers around KeyedListEditor.
// Split out of RankingsEditor.tsx (2026-06 L2 decomposition). Each one
// computes its usage-by-key map and supplies the recipes that touch
// `scheme.tiers` vs `scheme.domains` (including the rename/delete
// cascades into `scheme.journals`).

import { useMemo } from 'react';
import type { RankingScheme } from '@/types/interfaces';
import KeyedListEditor from './KeyedListEditor';
import type { UpdateScheme } from './types';

export function TiersTab({
  scheme,
  editable,
  update,
}: {
  scheme: RankingScheme;
  editable: boolean;
  update: UpdateScheme;
}) {
  const usageByKey = useMemo(() => {
    const m = new Map<string, number>();
    for (const j of scheme.journals) m.set(j.tier, (m.get(j.tier) ?? 0) + 1);
    return m;
  }, [scheme.journals]);

  return (
    <KeyedListEditor
      items={scheme.tiers}
      editable={editable}
      usageByKey={usageByKey}
      noun='tier'
      addPlaceholder='Key (e.g. Q1)'
      emptyHint='No tiers yet. Add one below.'
      intro={
        <>
          Tiers are the buckets every journal is sorted into (e.g. CNRS uses
          1–4; a JCR-style ranking would use Q1–Q4). The <strong>key</strong> is
          the stable identifier stored on each journal — renaming it cascades to
          every journal that uses it.
        </>
      }
      onAdd={(key, label) =>
        update((d) => {
          if (d.tiers.some((t) => t.key === key)) return;
          d.tiers.push({ key, label: label || undefined });
        })
      }
      onRename={(oldKey, nextKey, nextLabel) =>
        update((d) => {
          const idx = d.tiers.findIndex((t) => t.key === oldKey);
          if (idx < 0) return;
          if (nextKey !== oldKey) {
            if (d.tiers.some((t) => t.key === nextKey)) return; // dedupe
            for (const j of d.journals) {
              if (j.tier === oldKey) j.tier = nextKey;
            }
          }
          d.tiers[idx] = { key: nextKey, label: nextLabel || undefined };
        })
      }
      onDelete={(key) =>
        update((d) => {
          d.tiers = d.tiers.filter((t) => t.key !== key);
        })
      }
      onCascadeDelete={(key) =>
        update((d) => {
          d.tiers = d.tiers.filter((t) => t.key !== key);
          d.journals = d.journals.filter((j) => j.tier !== key);
        })
      }
    />
  );
}

export function DomainsTab({
  scheme,
  editable,
  update,
}: {
  scheme: RankingScheme;
  editable: boolean;
  update: UpdateScheme;
}) {
  const usageByKey = useMemo(() => {
    const m = new Map<string, number>();
    for (const j of scheme.journals)
      m.set(j.domain, (m.get(j.domain) ?? 0) + 1);
    return m;
  }, [scheme.journals]);

  return (
    <KeyedListEditor
      items={scheme.domains}
      editable={editable}
      usageByKey={usageByKey}
      noun='domain'
      addPlaceholder='Key (e.g. Cardio)'
      emptyHint='No domains yet. Add one below.'
      intro={
        <>
          Domains are subject areas (CNRS Economics calls them GEN, OrgInd,
          etc.; a medical scheme might use cardiology, oncology, …). Renaming a
          domain&apos;s key cascades to every journal that uses it.
        </>
      }
      onAdd={(key, label) =>
        update((d) => {
          if (d.domains.some((x) => x.key === key)) return;
          d.domains.push({ key, label: label || undefined });
        })
      }
      onRename={(oldKey, nextKey, nextLabel) =>
        update((d) => {
          const idx = d.domains.findIndex((x) => x.key === oldKey);
          if (idx < 0) return;
          if (nextKey !== oldKey) {
            if (d.domains.some((x) => x.key === nextKey)) return;
            for (const j of d.journals) {
              if (j.domain === oldKey) j.domain = nextKey;
            }
          }
          d.domains[idx] = { key: nextKey, label: nextLabel || undefined };
        })
      }
      onDelete={(key) =>
        update((d) => {
          d.domains = d.domains.filter((x) => x.key !== key);
        })
      }
      onCascadeDelete={(key) =>
        update((d) => {
          d.domains = d.domains.filter((x) => x.key !== key);
          d.journals = d.journals.filter((j) => j.domain !== key);
        })
      }
    />
  );
}
