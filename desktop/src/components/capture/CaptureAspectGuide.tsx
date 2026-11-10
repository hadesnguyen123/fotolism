import React from 'react'

interface CaptureAspectGuideProps {
  guideBoxStyle: React.CSSProperties
}

export const CaptureAspectGuide: React.FC<CaptureAspectGuideProps> = ({ guideBoxStyle }) => {
  return (
    <div className="capture-aspect-guide-overlay">
      <div className="capture-aspect-guide-box" style={guideBoxStyle}>
        <div className="guide-corner top-left" />
        <div className="guide-corner top-right" />
        <div className="guide-corner bottom-left" />
        <div className="guide-corner bottom-right" />
        <div className="guide-hint-text">
          Đứng trong khung này để không bị cắt ảnh
        </div>
      </div>
    </div>
  )
}
