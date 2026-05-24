import React from 'react'
import { format } from 'date-fns'
import { ClaimEvent } from '../types'
import { Activity } from 'lucide-react'

interface TimelineProps {
  events: ClaimEvent[]
}

const Timeline: React.FC<TimelineProps> = ({ events }) => {
  if (events.length === 0) {
    return <p className="text-sm text-gray-500 italic">No activity recorded yet.</p>
  }

  return (
    <ol className="relative border-l border-gray-200 ml-3">
      {events.map((event, index) => (
        <li key={event.id} className={`mb-6 ml-6 ${index === events.length - 1 ? 'mb-0' : ''}`}>
          <span className="absolute -left-3 flex h-6 w-6 items-center justify-center rounded-full bg-indigo-100 ring-4 ring-white">
            <Activity className="h-3 w-3 text-indigo-600" />
          </span>
          <div className="rounded-lg bg-gray-50 border border-gray-200 p-3">
            <div className="flex items-center justify-between mb-1">
              <span className="text-sm font-medium text-gray-900">{event.action}</span>
              <time className="text-xs text-gray-500">
                {format(new Date(event.createdAt), 'MMM d, yyyy HH:mm')}
              </time>
            </div>
            {event.user && (
              <p className="text-xs text-gray-500">
                by {event.user.firstName} {event.user.lastName}
              </p>
            )}
            {event.note && (
              <p className="mt-1 text-sm text-gray-700 border-t border-gray-200 pt-1">{event.note}</p>
            )}
          </div>
        </li>
      ))}
    </ol>
  )
}

export default Timeline
