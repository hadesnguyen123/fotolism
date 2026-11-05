import React from 'react'
import { Check } from 'lucide-react'
import './PhotoboothHeader.css'

export interface PhotoboothHeaderProps {
  currentStep: 1 | 2 | 3 | 4
}

export default function PhotoboothHeader({ currentStep }: PhotoboothHeaderProps) {
  const steps = [
    { num: 1, label: 'Chọn layout' },
    { num: 2, label: 'Confirm' },
    { num: 3, label: 'Thanh toán' },
    { num: 4, label: 'Chụp ảnh' },
  ]

  return (
    <header className="photobooth-header-unified">
      <h1 className="photobooth-brand-title">fotolism</h1>
      <nav className="photobooth-steps-bar" aria-label="Các bước Photobooth">
        {steps.map((step, idx) => {
          const isActive = currentStep === step.num
          const isPassed = currentStep > step.num

          return (
            <React.Fragment key={step.num}>
              {idx > 0 && (
                <div
                  className={`photobooth-step-divider ${
                    isPassed || isActive ? 'active' : ''
                  }`}
                />
              )}
              <div
                className={`photobooth-step-node ${
                  isActive ? 'is-active' : isPassed ? 'is-passed' : 'is-pending'
                }`}
              >
                <span className="photobooth-step-circle">
                  {isPassed ? <Check size={16} strokeWidth={3.2} /> : step.num}
                </span>
                <span className="photobooth-step-label">{step.label}</span>
              </div>
            </React.Fragment>
          )
        })}
      </nav>
    </header>
  )
}
