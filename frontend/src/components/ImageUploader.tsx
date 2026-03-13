'use client';

import { useCallback, useRef, useState } from 'react';
import { Upload, X, ImageIcon, Camera } from 'lucide-react';
import { cn, fileToBase64, formatFileSize } from '@/lib/utils';

interface ImageUploaderProps {
  label?: string;
  hint?: string;
  accept?: string;
  maxSizeMB?: number;
  value?: string;           // 当前已选图片的 data URI
  onChange: (dataUri: string | null) => void;
  disabled?: boolean;
  className?: string;
}

const MAX_SIZE_DEFAULT = 10; // MB

/**
 * 通过文件头魔数验证图片格式，防止 MIME 类型伪造（Issue #10）
 * 支持 JPEG (FF D8 FF)、PNG (89 50 4E 47)、WEBP (RIFF....WEBP)
 */
function validateMagicBytes(file: File): Promise<boolean> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const buf = e.target?.result;
      if (!(buf instanceof ArrayBuffer)) { resolve(false); return; }
      const bytes = new Uint8Array(buf);
      // JPEG: FF D8 FF
      if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) { resolve(true); return; }
      // PNG: 89 50 4E 47 0D 0A 1A 0A
      if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) { resolve(true); return; }
      // WEBP: 52 49 46 46 xx xx xx xx 57 45 42 50
      if (bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 &&
          bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50) {
        resolve(true); return;
      }
      resolve(false);
    };
    reader.onerror = () => resolve(false);
    reader.readAsArrayBuffer(file.slice(0, 12));
  });
}

export function ImageUploader({
  label = '上传图片',
  hint = '支持 JPG、PNG、WEBP，最大 10MB',
  accept = 'image/jpeg,image/png,image/webp',
  maxSizeMB = MAX_SIZE_DEFAULT,
  value,
  onChange,
  disabled = false,
  className,
}: ImageUploaderProps) {
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const processFile = useCallback(
    async (file: File) => {
      setError(null);
      if (!file.type.startsWith('image/')) {
        setError('请选择图片文件');
        return;
      }
      if (file.size > maxSizeMB * 1024 * 1024) {
        setError(`图片大小超过 ${maxSizeMB}MB 限制`);
        return;
      }
      // 魔数验证：防止 MIME 类型伪造
      const validMagic = await validateMagicBytes(file);
      if (!validMagic) {
        setError('文件格式无效，请上传真实的 JPG、PNG 或 WEBP 图片');
        return;
      }
      const dataUri = await fileToBase64(file);
      onChange(dataUri);
    },
    [maxSizeMB, onChange]
  );

  const handleFileChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) await processFile(file);
      // 清空 input，允许重复选同一文件
      e.target.value = '';
    },
    [processFile]
  );

  const handleDrop = useCallback(
    async (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      setDragging(false);
      const file = e.dataTransfer.files?.[0];
      if (file) await processFile(file);
    },
    [processFile]
  );

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragging(true);
  };
  const handleDragLeave = () => setDragging(false);

  const handleRemove = () => {
    setError(null);
    onChange(null);
  };

  return (
    <div className={cn('w-full', className)}>
      {label && (
        <label className="mb-1.5 block text-sm font-medium text-foreground">
          {label}
        </label>
      )}

      {value ? (
        // 已选中预览
        <div className="relative rounded-lg border bg-muted/30 overflow-hidden">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={value}
            alt="已上传图片"
            className="mx-auto max-h-64 w-auto object-contain p-2"
          />
          {!disabled && (
            <button
              type="button"
              onClick={handleRemove}
              className="absolute top-2 right-2 rounded-full bg-destructive/90 p-1 text-white shadow hover:bg-destructive transition-colors"
              aria-label="移除图片"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      ) : (
        // 拖拽 / 点击上传区域
        <div
          className={cn(
            'upload-dropzone flex flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed p-8 cursor-pointer select-none transition-all',
            dragging
              ? 'border-primary bg-primary/5 dragging'
              : 'border-muted-foreground/30 hover:border-primary/50 hover:bg-muted/30',
            disabled && 'pointer-events-none opacity-50'
          )}
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onClick={() => !disabled && inputRef.current?.click()}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => e.key === 'Enter' && !disabled && inputRef.current?.click()}
          aria-label={label}
        >
          <div className="flex items-center gap-3 text-muted-foreground">
            <Upload className="h-8 w-8" />
            <Camera className="h-8 w-8" />
            <ImageIcon className="h-8 w-8" />
          </div>
          <div className="text-center">
            <p className="text-sm font-medium text-foreground">
              拖拽图片或点击上传
            </p>
            <p className="mt-1 text-xs text-muted-foreground">{hint}</p>
          </div>
        </div>
      )}

      {error && (
        <p className="mt-1.5 text-xs text-destructive">{error}</p>
      )}

      <input
        ref={inputRef}
        type="file"
        accept={accept}
        className="hidden"
        onChange={handleFileChange}
        disabled={disabled}
        aria-hidden="true"
      />
    </div>
  );
}
