import React, { useRef, useState } from 'react'
import { UploadCloud, X, FileText } from 'lucide-react'

interface FileUploadProps {
  onChange: (files: File[]) => void
  accept?: string
  maxFiles?: number
  label?: string
}

const FileUpload: React.FC<FileUploadProps> = ({
  onChange,
  accept = '.pdf,.jpg,.jpeg,.png',
  maxFiles = 10,
  label = 'Upload documents',
}) => {
  const inputRef = useRef<HTMLInputElement>(null)
  const [files, setFiles] = useState<File[]>([])
  const [dragging, setDragging] = useState(false)

  const addFiles = (newFiles: FileList | null) => {
    if (!newFiles) return
    const arr = Array.from(newFiles)
    const updated = [...files, ...arr].slice(0, maxFiles)
    setFiles(updated)
    onChange(updated)
  }

  const removeFile = (index: number) => {
    const updated = files.filter((_, i) => i !== index)
    setFiles(updated)
    onChange(updated)
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setDragging(false)
    addFiles(e.dataTransfer.files)
  }

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }

  return (
    <div>
      <div
        className={`border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors ${
          dragging ? 'border-indigo-500 bg-indigo-50' : 'border-gray-300 hover:border-indigo-400'
        }`}
        onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
        data-testid="file-upload-zone"
      >
        <UploadCloud className="mx-auto h-10 w-10 text-gray-400 mb-2" />
        <p className="text-sm font-medium text-gray-700">{label}</p>
        <p className="text-xs text-gray-500 mt-1">
          Drag & drop or click to browse. PDF, JPG, PNG accepted.
        </p>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept={accept}
          className="hidden"
          onChange={(e) => addFiles(e.target.files)}
          data-testid="file-input"
        />
      </div>

      {files.length > 0 && (
        <ul className="mt-3 space-y-2">
          {files.map((file, index) => (
            <li
              key={index}
              className="flex items-center justify-between bg-gray-50 rounded-lg px-3 py-2 border border-gray-200"
            >
              <div className="flex items-center gap-2 min-w-0">
                <FileText className="h-4 w-4 text-indigo-500 flex-shrink-0" />
                <span className="text-sm text-gray-700 truncate">{file.name}</span>
                <span className="text-xs text-gray-400 flex-shrink-0">{formatSize(file.size)}</span>
              </div>
              <button
                type="button"
                className="ml-2 text-gray-400 hover:text-red-500 transition-colors"
                onClick={(e) => { e.stopPropagation(); removeFile(index) }}
                data-testid={`remove-file-${index}`}
              >
                <X className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export default FileUpload
