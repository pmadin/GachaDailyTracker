'use client';

import { useCallback, useRef, useState } from 'react';
import { previewIcon, type IconFit } from '../../_lib/api';

/**
 * Icon choice for an admin form: a file plus Crop/Pad, previewed through the real server
 * pipeline (POST /admin/icons/preview, nothing saved). Only the latest request wins.
 * Used by the submission ReviewPanel and the add/edit game form.
 */
export function useIconPicker(token: string) {
  const [file, setFile] = useState<File | null>(null);
  const [fit, setFitState] = useState<IconFit>('cover');
  const [preview, setPreview] = useState<{ url: string; bytes: number; animated: boolean } | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const seq = useRef(0);

  const run = useCallback((f: File, nextFit: IconFit) => {
    const mine = ++seq.current;
    setBusy(true);
    setError('');
    previewIcon(token, f, nextFit)
      .then(r => { if (mine === seq.current) setPreview({ url: r.data_url, bytes: r.bytes, animated: r.animated }); })
      .catch(err => {
        if (mine !== seq.current) return;
        setPreview(null);
        setError(err instanceof Error ? err.message : 'Icon processing failed');
      })
      .finally(() => { if (mine === seq.current) setBusy(false); });
  }, [token]);

  const choose = (f: File) => { setFile(f); run(f, fit); };
  const setFit = (f: IconFit) => { setFitState(f); if (file) run(file, f); };
  const clear = () => {
    seq.current++;
    setBusy(false);
    setFile(null);
    setPreview(null);
    setError('');
    if (inputRef.current) inputRef.current.value = '';
  };

  /** The file to upload, only once the server has accepted it in the preview. */
  const ready = preview ? file : null;
  return { file, fit, preview, error, busy, inputRef, choose, setFit, clear, ready };
}

export type IconPickerState = ReturnType<typeof useIconPicker>;

export function IconPicker({ picker, currentSrc, label = 'Icon (optional)' }: {
  picker: IconPickerState;
  /** What the game shows today, for edits. Falls back to the placeholder. */
  currentSrc?: string;
  label?: string;
}) {
  const { file, fit, preview, error, busy, inputRef, choose, setFit, clear } = picker;
  const src = preview?.url ?? currentSrc ?? '/placeholder.svg';
  return (
    <div>
      <label className="mb-1 block text-xs text-zinc-400">{label}</label>
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex h-[72px] w-[72px] flex-shrink-0 items-center justify-center overflow-hidden rounded-lg"
          style={{ background: 'var(--bg3)', border: '1px solid var(--border)' }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={src} alt="" width={72} height={72} style={{ aspectRatio: '1/1', opacity: busy ? 0.4 : 1 }}
            onError={e => { (e.currentTarget as HTMLImageElement).src = '/placeholder.svg'; }} />
        </div>
        <div className="space-y-2">
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => inputRef.current?.click()}
              className="rounded-lg border border-[rgba(200,155,60,0.15)] px-3 py-1.5 text-xs text-[#9a8570] hover:text-[#f0ede8]">
              {file ? 'Change file' : currentSrc ? 'Replace icon' : 'Choose file'}
            </button>
            {file && (
              <button type="button" onClick={clear} className="rounded-lg px-2 py-1.5 text-xs text-zinc-500 hover:text-zinc-300">
                {currentSrc ? 'Keep current' : 'Remove'}
              </button>
            )}
          </div>
          <div className="flex w-fit overflow-hidden rounded-lg border border-[rgba(200,155,60,0.15)] text-xs" role="group" aria-label="Icon fit">
            {(['cover', 'contain'] as const).map(f => (
              <button key={f} type="button" onClick={() => setFit(f)} aria-pressed={fit === f}
                className={`px-3 py-1.5 ${fit === f ? 'bg-[rgba(200,155,60,0.15)] text-[#e8c86a]' : 'text-[#9a8570] hover:text-[#f0ede8]'}`}>
                {f === 'cover' ? 'Crop' : 'Pad'}
              </button>
            ))}
          </div>
        </div>
      </div>
      <input ref={inputRef} type="file" accept="image/png,image/jpeg,image/webp,image/gif" className="hidden"
        onChange={e => { const f = e.target.files?.[0]; if (f) choose(f); }} />
      <p className="mt-2 text-xs" style={{ color: 'var(--text3)' }}>
        PNG, JPEG, WebP or GIF up to 2 MB. Re-encoded to a 96×96 WebP on the server; this preview is the real output.
        {preview && ` ${(preview.bytes / 1024).toFixed(1)} KB${preview.animated ? ', animated' : ''}.`}
      </p>
      {error && <p className="mt-1 text-xs text-red-400">{error}</p>}
    </div>
  );
}
