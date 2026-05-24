import React, { useState } from 'react'
import { format } from 'date-fns'
import { HelpCircle, CheckCircle, Send } from 'lucide-react'
import { InfoRequest } from '../types'
import { useAuthStore } from '../store/authStore'
import { respondInfo } from '../api/claims'
import { uploadDocuments } from '../api/documents'
import FileUpload from './FileUpload'
import toast from 'react-hot-toast'

interface InfoRequestCardProps {
  infoRequest: InfoRequest
  claimId: string
  onResponded?: () => void
}

const InfoRequestCard: React.FC<InfoRequestCardProps> = ({ infoRequest, claimId, onResponded }) => {
  const { user } = useAuthStore()
  const [response, setResponse] = useState('')
  const [attachedFiles, setAttachedFiles] = useState<File[]>([])
  const [submitting, setSubmitting] = useState(false)
  const canRespond = user?.role === 'PATIENT' && !infoRequest.respondedAt

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitting(true)
    try {
      if (attachedFiles.length > 0) {
        await uploadDocuments(claimId, attachedFiles)
      }
      await respondInfo(claimId, infoRequest.id, response.trim())
      toast.success('Response submitted successfully')
      onResponded?.()
    } catch {
      toast.error('Failed to submit response')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div
      className={`rounded-xl border p-4 ${infoRequest.response ? 'border-green-200 bg-green-50' : 'border-orange-200 bg-orange-50'}`}
      data-testid="info-request-card"
    >
      {/* Request */}
      <div className="flex items-start gap-3">
        <div className={`flex-shrink-0 rounded-full p-1.5 ${infoRequest.response ? 'bg-green-100' : 'bg-orange-100'}`}>
          {infoRequest.response ? (
            <CheckCircle className="h-4 w-4 text-green-600" />
          ) : (
            <HelpCircle className="h-4 w-4 text-orange-600" />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-semibold text-gray-900">
              {infoRequest.from
                ? `${infoRequest.from.firstName} ${infoRequest.from.lastName}`
                : 'Adjuster'} requested information
            </p>
            <time className="text-xs text-gray-500 flex-shrink-0">
              {format(new Date(infoRequest.createdAt), 'MMM d, yyyy')}
            </time>
          </div>
          <p className="mt-1 text-sm text-gray-700">{infoRequest.message}</p>
        </div>
      </div>

      {/* Response */}
      {infoRequest.response && (
        <div className="mt-3 pt-3 border-t border-green-200">
          <div className="flex items-start gap-3">
            <div className="flex-shrink-0 rounded-full bg-green-100 p-1.5">
              <CheckCircle className="h-4 w-4 text-green-600" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-semibold text-gray-900">Your response</p>
                {infoRequest.respondedAt && (
                  <time className="text-xs text-gray-500 flex-shrink-0">
                    {format(new Date(infoRequest.respondedAt), 'MMM d, yyyy')}
                  </time>
                )}
              </div>
              <p className="mt-1 text-sm text-gray-700">{infoRequest.response}</p>
            </div>
          </div>
        </div>
      )}

      {/* Response form */}
      {canRespond && (
        <form onSubmit={handleSubmit} className="mt-3 pt-3 border-t border-orange-200">
          <label className="block text-sm font-medium text-gray-700 mb-1">Your Response</label>
          <textarea
            value={response}
            onChange={(e) => setResponse(e.target.value)}
            rows={3}
            className="form-input resize-none"
            placeholder="Provide the requested information..."
            data-testid="info-response-input"
          />
          <div className="mt-3">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Attach Images <span className="text-gray-400 font-normal">(optional)</span>
            </label>
            <FileUpload
              accept="image/*"
              maxFiles={5}
              label="Upload receipt or supporting images"
              onChange={setAttachedFiles}
            />
          </div>
          <button
            type="submit"
            disabled={submitting || (!response.trim() && attachedFiles.length === 0)}
            className="mt-3 btn-primary"
            data-testid="submit-info-response-btn"
          >
            <Send className="h-4 w-4" />
            {submitting ? 'Submitting...' : 'Submit Response'}
          </button>
        </form>
      )}
    </div>
  )
}

export default InfoRequestCard
