import React from 'react';

// placeholder shown while a search is loading
function SkeletonCard() {
  return (
    <div className="skeleton-card">
      <div className="skeleton skeleton-badge" />
      <div className="skeleton skeleton-title" />
      <div className="skeleton skeleton-row" />
      <div className="skeleton skeleton-row" />
      <div className="skeleton skeleton-row" />
      <div className="skeleton-pred-row">
        <div className="skeleton skeleton-pred-box" />
        <div className="skeleton skeleton-pred-box" />
        <div className="skeleton skeleton-pred-box" />
      </div>
    </div>
  );
}

export function SkeletonMap() {
  return <div className="skeleton skeleton-map" />;
}

export default SkeletonCard;