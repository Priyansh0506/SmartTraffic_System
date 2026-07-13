import React, { useState, useEffect, useRef } from 'react';
import api from './api';

// Location search box jo type karte hi suggestions dikhata hai.
// Har keystroke pe seedha API na maarein isliye 350ms ruk kar (debounce)
// backend ko poochta hai. Backend khud TomTom try karta hai, agar wo
// fail ho jaye to Nominatim pe fallback kar leta hai - yahan se hume
// bas top 6 results dropdown mein dikhane hain.
function LocationAutocomplete({ className, placeholder, value, onChangeText, onSelectSuggestion, onEnter }) {
  const [suggestions, setSuggestions] = useState([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [loading, setLoading] = useState(false);
  const debounceRef = useRef(null);
  const wrapperRef = useRef(null);

  // dropdown ke bahar click ho to band kar do
  useEffect(() => {
    function handleClickOutside(e) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target)) {
        setShowDropdown(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    // box khaali hai to purani suggestions saaf kar do
    if (!value || !value.trim()) {
      setSuggestions([]);
      setShowDropdown(false);
      return;
    }

    if (debounceRef.current) clearTimeout(debounceRef.current);

    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await api.get('/api/geocode-suggestions', {
          params: { query: value },
        });
        // backend may return either an array or an object { suggestions: [] }
        const data = res.data || {};
        const list = Array.isArray(data) ? data : data.suggestions || [];
        setSuggestions(list || []);
        setShowDropdown(true);
        setActiveIndex(-1);
      } catch (e) {
        // suggestion fetch fail hui to bas dropdown khaali chhod do,
        // user phir bhi free-type karke Enter dabake search kar sakta hai
        setSuggestions([]);
      }
      setLoading(false);
    }, 350);

    return () => clearTimeout(debounceRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  function pickSuggestion(s) {
    onChangeText(s.display_name || s.name || '');
    // normalize keys so parents always receive lat/lon/place_type
    onSelectSuggestion({ lat: s.lat, lon: s.lon, place_type: s.place_type, name: s.name, display_name: s.display_name });
    setShowDropdown(false);
    setSuggestions([]);
  }

  function handleKeyDown(e) {
      if (showDropdown && suggestions.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setActiveIndex((i) => (i + 1) % suggestions.length);
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setActiveIndex((i) => (i - 1 + suggestions.length) % suggestions.length);
        return;
      }
        if (e.key === 'Enter') {
          e.preventDefault();
          if (activeIndex >= 0) {
            pickSuggestion(suggestions[activeIndex]);
          } else {
            setShowDropdown(false);
            onEnter && onEnter();
          }
          return;
        }
    }
    // fallback: if dropdown not shown, Enter should trigger search
    if (e.key === 'Enter') {
      e.preventDefault();
      setShowDropdown(false);
      onEnter && onEnter();
    }
    if (e.key === 'Escape') {
      setShowDropdown(false);
    }
  }

  return (
    <div className="location-autocomplete-wrapper" ref={wrapperRef} style={{ position: 'relative', flex: 1 }}>
      <input
        className={className}
        type="text"
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChangeText(e.target.value)}
        onKeyDown={handleKeyDown}
        onFocus={() => {
          if (suggestions.length > 0) setShowDropdown(true);
        }}
        autoComplete="off"
      />

      {showDropdown && (loading || suggestions.length > 0) && (
        <div className="autocomplete-dropdown">
          {loading && <div className="autocomplete-item autocomplete-loading">Searching...</div>}
          {!loading &&
            suggestions.map((s, i) => (
              <div
                key={i}
                className={'autocomplete-item' + (i === activeIndex ? ' autocomplete-item-active' : '')}
                onMouseDown={() => pickSuggestion(s)}
                onMouseEnter={() => setActiveIndex(i)}
              >
                <span className="autocomplete-item-main">{s.name}</span>
                {s.display_name && s.display_name !== s.name && (
                  <span className="autocomplete-item-sub">{s.display_name}</span>
                )}
              </div>
            ))}
        </div>
      )}
    </div>
  );
}

export default LocationAutocomplete;