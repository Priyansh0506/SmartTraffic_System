import React from 'react';
import './SkeletonCard.css';

// Skeleton shown in place of the traffic info card (Vehicles/Weather/Score etc.)
// while a search request is in flight.
export function SkeletonCard() {
  return (
    <div className="skeleton-card">
      <div className="skeleton-line skeleton-title" />

      <div className="skeleton-row">
        <div className="skeleton-line skeleton-label" />
        <div className="skeleton-line skeleton-value" />
      </div>
      <div className="skeleton-row">
        <div className="skeleton-line skeleton-label" />
        <div className="skeleton-line skeleton-value" />
      </div>
      <div className="skeleton-row">
        <div className="skeleton-line skeleton-label" />
        <div className="skeleton-line skeleton-value" />
      </div>

      <div className="skeleton-line skeleton-subtitle" />

      <div className="skeleton-row">
        <div className="skeleton-line skeleton-label-sm" />
        <div className="skeleton-line skeleton-value-sm" />
      </div>
      <div className="skeleton-row">
        <div className="skeleton-line skeleton-label-sm" />
        <div className="skeleton-line skeleton-value-sm" />
      </div>

      <div className="skeleton-box skeleton-accident" />
    </div>
  );
}

// Skeleton shown in place of the map while it's loading / before a
// location has been searched.
export function SkeletonMap() {
  return (
    <div className="skeleton-map">
      <div className="skeleton-map-shimmer" />
    </div>
  );
}

export default SkeletonCard;