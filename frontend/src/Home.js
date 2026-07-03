import React, { useRef, useEffect } from 'react';

// india map bg, took this from wikimedia commons (free to use, CC BY-SA 3.0)
// need to credit this somewhere on site, footer probably
const INDIA_MAP_URL = 'https://commons.wikimedia.org/wiki/Special:FilePath/India_outline.svg';

// just a faint india map sitting in the bg, moves a tiny bit on scroll/mouse
// so page doesnt feel dead. tried without the movement first but looked static af
function TrafficMap() {
  const imgRef = useRef();

  useEffect(() => {
    let raf;
    const mouse = { x: 0, y: 0 };
    const mouseSmooth = { x: 0, y: 0 };
    const scrollSmooth = { y: 0 };

    function handleMouse(e) {
      mouse.x = (e.clientX / window.innerWidth) - 0.5;
      mouse.y = (e.clientY / window.innerHeight) - 0.5;
    }
    window.addEventListener('mousemove', handleMouse);

    function tick() {
      // lerp toward the real mouse/scroll pos instead of snapping directly,
      // smoother that way. 0.04/0.06 just felt right after testing a bit
      mouseSmooth.x += (mouse.x - mouseSmooth.x) * 0.04;
      mouseSmooth.y += (mouse.y - mouseSmooth.y) * 0.04;
      scrollSmooth.y += (window.scrollY - scrollSmooth.y) * 0.06;

      if (imgRef.current) {
        const driftY = scrollSmooth.y * 0.08;
        imgRef.current.style.transform =
          `translate(-50%, calc(-50% + ${driftY + mouseSmooth.y * 10}px)) translateX(${mouseSmooth.x * 16}px)`;
      }
      raf = requestAnimationFrame(tick);
    }
    tick();

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('mousemove', handleMouse);
    };
  }, []);

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 0, overflow: 'hidden', pointerEvents: 'none' }}>
      <img
        ref={imgRef}
        src={INDIA_MAP_URL}
        alt=""
        style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          width: 900,
          maxWidth: '85vw',
          transform: 'translate(-50%, -50%)',
          opacity: 0.16,
          filter: 'invert(1)',
          mixBlendMode: 'screen'
        }}
      />
    </div>
  );
}

// card that tilts based on where your mouse is on it + glows in its own color
// on hover. saw this effect on some portfolio site and wanted to try it here
function FeatureCard({ title, desc, stat, color, onClick }) {
  const cardRef = useRef();

  function handleMove(e) {
    const card = cardRef.current;
    const rect = card.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const rotateY = ((x / rect.width) - 0.5) * 14;
    const rotateX = ((y / rect.height) - 0.5) * -14;

    card.style.transform = `perspective(700px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) translateZ(10px)`;
  }

  function handleLeave() {
    cardRef.current.style.transform = 'perspective(700px) rotateX(0deg) rotateY(0deg) translateZ(0px)';
    cardRef.current.style.boxShadow = 'none';
    cardRef.current.style.borderColor = '#1f2128';
  }

  function handleEnter() {
    cardRef.current.style.borderColor = color;
    cardRef.current.style.boxShadow = `0 0 24px ${color}33`;
  }

  return (
    <div
      ref={cardRef}
      onMouseMove={handleMove}
      onMouseEnter={handleEnter}
      onMouseLeave={handleLeave}
      onClick={onClick}
      style={{
        background: '#1a1d24',
        border: '1px solid #1f2128',
        borderRadius: 10,
        padding: '24px 22px',
        cursor: 'pointer',
        transition: 'transform 0.15s ease-out, border-color 0.15s, box-shadow 0.2s',
        transformStyle: 'preserve-3d'
      }}
    >
      <div style={{ width: 8, height: 8, borderRadius: '50%', background: color, marginBottom: 14 }} />
      <h3 style={{ fontSize: 16, fontWeight: 600, color: '#e5e7eb', marginBottom: 6 }}>{title}</h3>
      <p style={{ fontSize: 13, color: '#6b7280', lineHeight: 1.5, marginBottom: 14 }}>{desc}</p>
      <p style={{ fontSize: 11, color: '#4b5563', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{stat}</p>
    </div>
  );
}

function Home({ onNavigate }) {
  // all the feature cards shown on home. id = which tab it should jump to
  // on click. accident risk doesn't have its own tab (by design — it's
  // shown inline wherever a real lat/lon is available) so it points to
  // Live Monitor, which is where it's always visible.
  const features = [
    {
      id: 'monitor',
      title: 'Live Monitor',
      desc: 'Search any location in India and see current traffic load, weather, and a short-term congestion forecast.',
      stat: 'Live data',
      color: '#60a5fa'
    },
    {
      id: 'demo',
      title: 'Demo Evaluation',
      desc: 'Upload a traffic video and the system detects vehicles itself using YOLOv8 object detection, no manual tagging needed.',
      stat: 'YOLO + ML',
      color: '#4ade80'
    },
    {
      id: 'monitor',
      title: 'Peak Hour Analysis',
      desc: 'Takes whatever vehicle count it has right now and projects a full 24-hour curve from it, using a weekday/weekend pattern instead of one flat number.',
      stat: 'Trend forecast',
      color: '#a78bfa'
    },
    {
      id: 'route',
      title: 'Route Optimizer',
      desc: 'Pick a start and destination, get back the least congested road out of a few real alternatives.',
      stat: 'OSRM routing',
      color: '#fb923c'
    },
    {
      id: 'emergency',
      title: 'Emergency Dispatch',
      desc: 'Ambulance and fire brigade routing that assumes the road ahead gets cleared, with time-saved shown.',
      stat: 'Priority routing',
      color: '#f87171'
    },
    {
      id: 'monitor',
      title: 'Accident Risk',
      desc: 'A trained neural network scores how risky a road currently is from weather, time of day and traffic flow — not just how jammed it is. Falls back to a rule-based formula if the model is ever unavailable.',
      stat: 'ML risk scoring',
      color: '#facc15'
    }
  ];

  return (
    <div style={{ position: 'relative', maxWidth: 1080, margin: '0 auto', padding: '40px 28px 60px' }}>
      <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
        <TrafficMap />
      </div>

      <div style={{ position: 'relative', marginBottom: 48 }}>
        
        <h1 style={{ fontSize: 34, fontWeight: 700, color: '#e5e7eb', marginBottom: 14, maxWidth: 600 }}>
          Smart Traffic Congestion System
        </h1>
        <p style={{ fontSize: 14, color: '#9ca3af', lineHeight: 1.6, maxWidth: 520 }}>
          Started as a way to predict traffic congestion from live data and camera footage.
          Grew into four working pieces — live monitoring, video-based vehicle counting,
          route optimization, and emergency vehicle priority routing — plus a 24-hour
          peak-hour forecast and ML-based accident risk scoring layered on top of whichever
          piece detected the traffic.
        </p>
      </div>

      <div style={{
        position: 'relative',
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
        gap: 18
      }}>
        {features.map((f, i) => (
          <FeatureCard
            key={i}
            title={f.title}
            desc={f.desc}
            stat={f.stat}
            color={f.color}
            onClick={() => onNavigate(f.id)}
          />
        ))}
      </div>
    </div>
  );
}

export default Home;