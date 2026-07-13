import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';
import reportWebVitals from './reportWebVitals';

// Guard IntersectionObserver.observe/unobserve so libraries that mistakenly
// call observe(null) don't throw and spam the console (fixes
// "parameter 1 is not of type 'Element'" runtime errors).
if (typeof window !== 'undefined' && window.IntersectionObserver) {
  try {
    const proto = window.IntersectionObserver.prototype;
    const origObserve = proto.observe;
    const origUnobserve = proto.unobserve;

    proto.observe = function (target) {
      if (target && target.nodeType === 1) {
        try {
          return origObserve.call(this, target);
        } catch (e) {
          // swallow errors to avoid crashing app
          return;
        }
      }
      // ignore non-element targets
    };

    proto.unobserve = function (target) {
      if (target && target.nodeType === 1) {
        try {
          return origUnobserve.call(this, target);
        } catch (e) {
          return;
        }
      }
    };
  } catch (e) {
    // defensive - if anything goes wrong, don't block startup
  }
}

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

// If you want to start measuring performance in your app, pass a function
// to log results (for example: reportWebVitals(console.log))
// or send to an analytics endpoint. Learn more: https://bit.ly/CRA-vitals
reportWebVitals();
