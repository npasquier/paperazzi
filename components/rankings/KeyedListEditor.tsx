'use client';

// Generic key+label list editor shared by the Tiers and Domains tabs.
// Split out of RankingsEditor.tsx (2026-06 L2 decomposition).
//
// Tiers and domains share every piece of behaviour — same row shape (key
// + label + cascading usage count), same add form, same delete flow
// (no-warning for empty buckets, cascade-with-confirm otherwise). This
// component does all the rendering; the TiersTab / DomainsTab wrappers
// compute the usage-by-key map and hand it the recipes that touch
// `scheme.tiers` vs `scheme.domains`.

import { useState } from 'react';
import { Plus, Pencil, X } from 'lucide-react';
import ConfirmModal from './ConfirmModal';

export interface KeyedItem {
  key: string;
  label?: string;
}

interface KeyedListEditorProps {
  /** The items to render — RankingTier[] or RankingDomain[]. */
  items: readonly KeyedItem[];
  /** Whether the user can edit. */
  editable: boolean;
  /** Per-key journal-usage count, drives cascade-delete confirmation. */
  usageByKey: Map<string, number>;
  /** Singular noun for UI strings ("tier", "domain"). */
  noun: string;
  /** Lead paragraph at the top of the panel. */
  intro: React.ReactNode;
  /** Empty-state copy when items is []. */
  emptyHint: string;
  /** Placeholder for the Key input on the add form. */
  addPlaceholder: string;
  /** Add a new item. Caller is responsible for dedupe at the scheme level. */
  onAdd: (key: string, label: string) => void;
  /** Rename an item. Caller cascades the key change to every journal. */
  onRename: (oldKey: string, nextKey: string, nextLabel: string) => void;
  /** Delete an item that has no journals using it (one-click). */
  onDelete: (key: string) => void;
  /** Delete the item AND every journal that references it (confirm path). */
  onCascadeDelete: (key: string) => void;
}

export default function KeyedListEditor({
  items,
  editable,
  usageByKey,
  noun,
  intro,
  emptyHint,
  addPlaceholder,
  onAdd,
  onRename,
  onDelete,
  onCascadeDelete,
}: KeyedListEditorProps) {
  const [newKey, setNewKey] = useState('');
  const [newLabel, setNewLabel] = useState('');
  // Surface the cascade-delete warning ("X journals will also be deleted")
  // before commit. Only entered when the targeted item is non-empty —
  // empty items delete in one click.
  const [pendingDelete, setPendingDelete] = useState<{
    key: string;
    label?: string;
    count: number;
  } | null>(null);

  const addItem = () => {
    const key = newKey.trim();
    if (!key) return;
    if (items.some((x) => x.key === key)) return; // dedupe at UI layer
    onAdd(key, newLabel.trim());
    setNewKey('');
    setNewLabel('');
  };

  return (
    <div className='space-y-4'>
      <p className='text-sm text-app-muted'>{intro}</p>

      <div className='border border-app rounded-lg overflow-hidden'>
        <div className='grid grid-cols-[1fr_2fr_auto_auto] gap-3 px-3 py-2 surface-subtle text-[11px] uppercase tracking-wider text-app-soft border-b border-app'>
          <div>Key</div>
          <div>Label (optional)</div>
          <div>Journals</div>
          <div></div>
        </div>
        {items.length === 0 && (
          <div className='px-3 py-6 text-center text-sm text-app-soft'>
            {emptyHint}
          </div>
        )}
        {items.map((item) => {
          const count = usageByKey.get(item.key) ?? 0;
          return (
            <KeyedListRow
              key={item.key}
              item={item}
              count={count}
              editable={editable}
              noun={noun}
              onRename={(nextKey, nextLabel) =>
                onRename(item.key, nextKey, nextLabel)
              }
              onDelete={() => {
                if (count === 0) {
                  onDelete(item.key);
                } else {
                  setPendingDelete({
                    key: item.key,
                    label: item.label,
                    count,
                  });
                }
              }}
            />
          );
        })}
      </div>

      {editable && (
        <div className='border border-app rounded-lg p-3 surface-subtle'>
          <p className='text-xs font-medium text-app-muted mb-2'>
            Add a {noun}
          </p>
          <div className='flex gap-2'>
            <input
              value={newKey}
              onChange={(e) => setNewKey(e.target.value)}
              placeholder={addPlaceholder}
              className='flex-1 px-2 py-1 text-sm border border-app rounded'
            />
            <input
              value={newLabel}
              onChange={(e) => setNewLabel(e.target.value)}
              placeholder='Label (optional)'
              className='flex-1 px-2 py-1 text-sm border border-app rounded'
            />
            <button
              onClick={addItem}
              disabled={!newKey.trim()}
              className='inline-flex items-center gap-1 px-3 py-1 button-primary rounded text-sm disabled:opacity-50 disabled:cursor-not-allowed'
            >
              <Plus size={14} />
              Add
            </button>
          </div>
        </div>
      )}

      {pendingDelete && (
        <ConfirmModal
          title={`Delete ${noun} "${
            pendingDelete.label || pendingDelete.key
          }"?`}
          body={
            <div className='space-y-1 text-sm text-app-muted'>
              <div>
                The {noun} will be removed from the scheme,{' '}
                <strong>
                  along with the {pendingDelete.count.toLocaleString()} journal
                  {pendingDelete.count === 1 ? '' : 's'}
                </strong>{' '}
                currently assigned to it.
              </div>
              <div className='text-app-soft'>
                This cannot be undone — the only way back is to import the
                scheme again, or click <em>Reset to default</em> if you want to
                discard all of your edits.
              </div>
            </div>
          }
          confirmLabel={`Delete ${noun} and its journals`}
          confirmTone='danger'
          onConfirm={() => {
            onCascadeDelete(pendingDelete.key);
            setPendingDelete(null);
          }}
          onCancel={() => setPendingDelete(null)}
        />
      )}
    </div>
  );
}

function KeyedListRow({
  item,
  count,
  editable,
  noun,
  onRename,
  onDelete,
}: {
  item: KeyedItem;
  count: number;
  editable: boolean;
  noun: string;
  onRename: (nextKey: string, nextLabel: string) => void;
  onDelete: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draftKey, setDraftKey] = useState(item.key);
  const [draftLabel, setDraftLabel] = useState(item.label ?? '');
  // Keep drafts in sync if the prop changes underneath us. Previous-prop
  // comparison during render avoids the React 19 setState-in-useEffect
  // anti-pattern.
  const [prevSig, setPrevSig] = useState(`${item.key} ${item.label ?? ''}`);
  const sig = `${item.key} ${item.label ?? ''}`;
  if (prevSig !== sig) {
    setPrevSig(sig);
    setDraftKey(item.key);
    setDraftLabel(item.label ?? '');
  }

  const commit = () => {
    const key = draftKey.trim();
    if (key) onRename(key, draftLabel.trim());
    setEditing(false);
  };

  return (
    <div className='grid grid-cols-[1fr_2fr_auto_auto] gap-3 items-center px-3 py-2 border-b border-app last:border-b-0 text-sm'>
      {editing ? (
        <>
          <input
            value={draftKey}
            onChange={(e) => setDraftKey(e.target.value)}
            className='px-2 py-1 border border-app rounded text-sm'
          />
          <input
            value={draftLabel}
            onChange={(e) => setDraftLabel(e.target.value)}
            placeholder='Label'
            className='px-2 py-1 border border-app rounded text-sm'
          />
        </>
      ) : (
        <>
          <code className='text-app font-medium'>{item.key}</code>
          <span className='text-app-muted'>
            {item.label || (
              <span className='text-app-soft italic'>(no label)</span>
            )}
          </span>
        </>
      )}
      <span className='text-[11px] text-app-soft text-right'>
        {count.toLocaleString()}
      </span>
      <div className='flex items-center gap-1 justify-end'>
        {editable && !editing && (
          <button
            onClick={() => setEditing(true)}
            className='p-1 text-app-soft hover:text-app'
            title='Rename'
          >
            <Pencil size={12} />
          </button>
        )}
        {editable && editing && (
          <button
            onClick={commit}
            className='px-2 py-0.5 button-primary rounded text-xs'
          >
            Save
          </button>
        )}
        {editable && !editing && (
          <button
            onClick={onDelete}
            className='p-1 text-app-soft hover:text-danger'
            title={
              count > 0
                ? `Delete this ${noun} and its ${count.toLocaleString()} journal${
                    count === 1 ? '' : 's'
                  }`
                : 'Delete'
            }
          >
            <X size={12} />
          </button>
        )}
      </div>
    </div>
  );
}
