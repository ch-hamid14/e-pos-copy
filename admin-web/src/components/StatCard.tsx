import type { ReactNode } from 'react'

type Props = {
  label: string
  value: string | number
  hint?: string
  icon?: ReactNode
}

export default function StatCard({ label, value, hint, icon }: Props) {
  return (
    <div className="madix-stat">
      <div className="madix-stat__label">
        {icon}
        <span>{label}</span>
      </div>
      <div>
        <div className="madix-stat__value">{value}</div>
        {hint ? <div className="madix-stat__hint">{hint}</div> : null}
      </div>
    </div>
  )
}
