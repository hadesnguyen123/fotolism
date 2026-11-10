import React from 'react'
import { Palette, Check } from 'lucide-react'
import { COLOR_FILTERS, type ColorFilterItem } from '../../store/appStore'

interface FilterSelectorDeckProps {
  selectedFilter: ColorFilterItem
  onSelectFilter: (filter: ColorFilterItem) => void
}

export const FilterSelectorDeck: React.FC<FilterSelectorDeckProps> = ({
  selectedFilter,
  onSelectFilter,
}) => {
  return (
    <div className="theme-filter-card">
      <div className="filter-section-header">
        <div className="carousel-card-title-group">
          <Palette className="control-header-icon" size={20} strokeWidth={2.4} />
          <h2 className="carousel-card-title">Chọn filter</h2>
        </div>
      </div>

      <div className="filter-circles-row" role="radiogroup" aria-label="Chọn bộ lọc màu">
        {COLOR_FILTERS.map((filter: ColorFilterItem) => {
          const isSelected = selectedFilter.id === filter.id
          const circleBg =
            filter.id === 'normal'
              ? '#E4D2C3'
              : filter.id === 'vintage_noir'
              ? '#262626'
              : '#96532B'
          return (
            <button
              key={filter.id}
              type="button"
              role="radio"
              aria-checked={isSelected}
              className={`filter-circle-btn ${isSelected ? 'selected' : ''}`}
              style={{
                backgroundColor: circleBg,
                ['--circle-color' as any]: circleBg,
              }}
              onClick={() => onSelectFilter(filter)}
              title={filter.name}
              aria-label={`Bộ lọc ${filter.name}`}
            >
              {isSelected && (
                <Check
                  size={20}
                  strokeWidth={3}
                  color="#FFFFFF"
                  style={{ filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.35))' }}
                />
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}
