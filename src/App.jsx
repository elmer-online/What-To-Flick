
import React, { useState, useEffect, useCallback } from 'react';
import { DB, MOODS, MOOD_MAP, IC } from './data';

/* ═══════════════════════════════════════════════════════════════════════════
   RECOMMENDATION ENGINE — Soft-weight system
   Liked tags boost score, disliked tags reduce. Rated titles get heavy penalty
   but are NOT excluded — they just appear much less often.
   ═══════════════════════════════════════════════════════════════════════════ */
function buildTasteScores(ratings) {
  const tagScores = {};
  Object.entries(ratings).forEach(([id, r]) => {
    const movie = DB.find(m => m.id === parseInt(id));
    if (!movie) return;
    const w = r === "like" ? 1.2 : r === "dislike" ? -0.7 : 0;
    if (w !== 0) movie.tags.forEach(t => { tagScores[t] = (tagScores[t] || 0) + w; });
  });
  return tagScores;
}

function scoreAndPick(candidates, tagScores, ratings, count) {
  // Shuffle-first approach: randomness dominates, taste is a mild boost
  const scored = candidates.map(m => {
    let taste = 0;
    m.tags.forEach(t => { taste += tagScores[t] || 0; });
    // Clamp taste influence so it nudges but doesn't dominate
    taste = Math.max(-2, Math.min(2, taste * 0.3));
    // Heavy penalty for already-rated titles
    const r = ratings[m.id];
    if (r === "like") taste -= 20;
    else if (r === "neutral") taste -= 25;
    else if (r === "dislike") taste -= 30;
    // Random is the main driver — ensures real variety on each refresh
    const score = Math.random() * 10 + taste;
    return { ...m, score };
  });
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, count);
}

function getRecommendations(mood, ratings, typeFilter, count = 4) {
  const tagScores = buildTasteScores(ratings);
  const seen = new Set(Object.keys(ratings).map(Number));
  let candidates = DB.filter(m => m.moods.includes(mood) && !seen.has(m.id));
  if (typeFilter !== "all") candidates = candidates.filter(m => m.type === typeFilter);
  return scoreAndPick(candidates, tagScores, ratings, count);
}

function getSurpriseRecommendations(ratings, typeFilter, count = 4) {
  const tagScores = buildTasteScores(ratings);
  let candidates = [...DB];
  if (typeFilter !== "all") candidates = candidates.filter(m => m.type === typeFilter);
  if (Object.keys(ratings).length === 0) {
    return candidates.sort(() => Math.random() - 0.5).slice(0, count);
  }
  return scoreAndPick(candidates, tagScores, ratings, count);
}

function getOneReplacement(mood, ratings, excludeIds, typeFilter) {
  const tagScores = buildTasteScores(ratings);
  const seen = new Set(Object.keys(ratings).map(Number));
  const exclude = new Set([...seen, ...excludeIds]);
  let candidates = mood
    ? DB.filter(m => m.moods.includes(mood) && !exclude.has(m.id))
    : DB.filter(m => !exclude.has(m.id));
  if (typeFilter !== "all") candidates = candidates.filter(m => m.type === typeFilter);
  if (candidates.length === 0) return null;
  return scoreAndPick(candidates, tagScores, ratings, 1)[0] || null;
}

function getTasteProfile(ratings) {
  const liked = Object.entries(ratings).filter(([, r]) => r === "like").map(([id]) => parseInt(id));
  if (liked.length === 0) return [];
  const tagCounts = {};
  liked.forEach(id => {
    const movie = DB.find(m => m.id === id);
    if (movie) movie.tags.forEach(t => { tagCounts[t] = (tagCounts[t] || 0) + 1; });
  });
  return Object.entries(tagCounts).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([t]) => t.replace(/-/g, " "));
}

/* ═══════════════════════════════════════════════════════════════════════════
   STORAGE
   ═══════════════════════════════════════════════════════════════════════════ */
const SK = "wtf_r4", WK = "wtf_w4";
function loadR() { try { const s = localStorage.getItem(SK); return s ? JSON.parse(s) : {}; } catch { return {}; } }
function saveR(r) { try { localStorage.setItem(SK, JSON.stringify(r)); } catch { } }
function loadW() { try { const s = localStorage.getItem(WK); return s ? JSON.parse(s) : []; } catch { return []; } }
function saveW(l) { try { localStorage.setItem(WK, JSON.stringify(l)); } catch { } }

function MiniIcon({ name, color = "#666" }) {
  const fn = IC[name];
  return fn ? fn(color) : <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.5"><circle cx="12" cy="12" r="4" /></svg>;
}

/* ═══════════════════════════════════════════════════════════════════════════
   MOVIE CARD COMPONENT
   ═══════════════════════════════════════════════════════════════════════════ */
function MovieCard({ movie, rating, onRate, onWatchlist, isOnWatchlist, style, isExiting, theme }) {
  const moodColor = MOOD_MAP[movie.moods[0]]?.color || "#666";
  const t = theme || TH.dark;
  return (
    <div style={{
      ...S.card, background: t.card, borderColor: t.border, ...style,
      ...(isExiting ? { animation: "fadeOut 0.3s ease forwards", pointerEvents: "none" } : {}),
    }}>
      <div style={{ ...S.poster, borderColor: moodColor + "25", background: t.bg }}>
        <MiniIcon name={movie.icon} color={moodColor} />
      </div>
      <div style={S.info}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <div style={{ ...S.title, color: t.text }}>{movie.title}</div>
          <button
            onClick={() => window.open(`https://www.imdb.com/find?q=${encodeURIComponent(movie.title + " " + movie.year)}`, "_blank")}
            style={{ background: "none", border: "none", padding: 0, display: "flex", opacity: 0.4, cursor: "pointer" }}
            onMouseEnter={e => e.currentTarget.style.opacity = 0.8}
            onMouseLeave={e => e.currentTarget.style.opacity = 0.4}
            title="Search on IMDb"
          >
            <MiniIcon name="info" color={t.sub} />
          </button>
        </div>
        <div style={{ ...S.meta, color: t.sub }}>{movie.year} · {movie.type === "series" ? "Series" : "Film"}</div>
        <div style={S.tags}>
          {movie.tags.slice(0, 3).map(t2 => (
            <span key={t2} style={{ ...S.tagPill, background: t.pill, color: t.pillText }}>{t2.replace(/-/g, " ")}</span>
          ))}
        </div>
      </div>
      <div style={S.actions}>
        <button onClick={() => onRate(movie.id, "like")} style={{
          ...S.rBtn, background: rating === "like" ? "#55A38B15" : "transparent",
          color: rating === "like" ? "#55A38B" : t.sub,
        }} title="Liked it">▲</button>
        <button onClick={() => onRate(movie.id, "neutral")} style={{
          ...S.rBtn, background: rating === "neutral" ? "#88888815" : "transparent",
          color: rating === "neutral" ? "#AAA" : t.dim, fontSize: 8,
        }} title="Seen, no opinion">●</button>
        <button onClick={() => onRate(movie.id, "dislike")} style={{
          ...S.rBtn, background: rating === "dislike" ? "#E8637A15" : "transparent",
          color: rating === "dislike" ? "#E8637A" : t.sub,
        }} title="Not for me">▼</button>
        <button onClick={() => onWatchlist(movie.id)} style={{
          ...S.rBtn, background: isOnWatchlist ? "#F5A62315" : "transparent",
          color: isOnWatchlist ? "#F5A623" : t.sub, fontSize: 14,
        }} title={isOnWatchlist ? "Remove" : "Watch Later"}>{isOnWatchlist ? "★" : "☆"}</button>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   MAIN APP
   ═══════════════════════════════════════════════════════════════════════════ */
export default function App() {
  const [view, setView] = useState("home");
  const [selectedMood, setSelectedMood] = useState(null);
  const [results, setResults] = useState([]);
  const [ratings, setRatings] = useState(loadR);
  const [watchlist, setWatchlist] = useState(loadW);
  const [browseSearch, setBrowseSearch] = useState("");
  const [browseFilter, setBrowseFilter] = useState("all");
  const [resultTypeFilter, setResultTypeFilter] = useState("all");
  const [animateIn, setAnimateIn] = useState(false);
  const [exitingIds, setExitingIds] = useState(new Set());
  const [ratedFilter, setRatedFilter] = useState("all");
  const [ratedType, setRatedType] = useState("all");
  const [dark, setDark] = useState(() => { try { return localStorage.getItem("wtf_theme") !== "light"; } catch { return true; } });
  const [browseMoodTag, setBrowseMoodTag] = useState(new Set());
  const [ratedMoodTag, setRatedMoodTag] = useState(new Set());
  const [wlMoodTag, setWlMoodTag] = useState(new Set());
  const [wlType, setWlType] = useState("all");

  // --- NEW FEATURES STATE ---
  const [blacklistedMoods, setBlacklistedMoods] = useState(new Set());
  const [selectedDecade, setSelectedDecade] = useState("all");

  const toggleMoodBlacklist = (moodId, e) => {
    if (e.altKey || e.type === "contextmenu") {
      e.preventDefault();
      setBlacklistedMoods(prev => {
        const next = new Set(prev);
        if (next.has(moodId)) next.delete(moodId);
        else next.add(moodId);
        return next;
      });
      return true; // was handled as blacklist toggle
    }
    return false;
  };

  const toggleMoodTag = (setter) => (id, e) => {
    if (toggleMoodBlacklist(id, e)) return;

    setter(prev => {
      if (id === "all") return new Set();
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const matchMoodSet = (moods, filterSet) => {
    // Check blacklist first
    if (moods.some(m => blacklistedMoods.has(m))) return false;
    return filterSet.size === 0 || moods.some(m => filterSet.has(m));
  };

  const matchDecade = (year) => {
    if (selectedDecade === "all") return true;
    if (selectedDecade === "pre60") return year < 1960;
    const decade = Math.floor(year / 10) * 10;
    return decade === parseInt(selectedDecade);
  };

  useEffect(() => { try { localStorage.setItem("wtf_theme", dark ? "dark" : "light"); } catch { } }, [dark]);
  const T = dark ? TH.dark : TH.light;

  useEffect(() => { saveR(ratings); }, [ratings]);
  useEffect(() => { saveW(watchlist); }, [watchlist]);

  // Rate-and-replace in results
  const handleRateInResults = useCallback((id, value) => {
    setExitingIds(prev => new Set([...prev, id]));
    setTimeout(() => {
      setRatings(prev => ({ ...prev, [id]: value }));
      setResults(prev => {
        const currentIds = prev.map(m => m.id);
        const updatedRatings = { ...ratings, [id]: value };
        const replacement = getOneReplacement(selectedMood, updatedRatings, currentIds, resultTypeFilter);
        const next = prev.filter(m => m.id !== id);
        if (replacement) next.push(replacement);
        return next;
      });
      setExitingIds(prev => { const n = new Set(prev); n.delete(id); return n; });
    }, 300);
  }, [ratings, selectedMood, resultTypeFilter]);

  // Toggle rate in browse/watchlist
  const handleRate = useCallback((id, value) => {
    setRatings(prev => {
      const next = { ...prev };
      if (prev[id] === value) delete next[id];
      else next[id] = value;
      return next;
    });
  }, []);

  const handleWatchlist = useCallback((id) => {
    setWatchlist(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]);
  }, []);

  const selectMood = (moodId) => {
    setSelectedMood(moodId);
    setResults(getRecommendations(moodId, ratings, resultTypeFilter));
    setAnimateIn(false);
    setTimeout(() => { setView("results"); setAnimateIn(true); }, 50);
  };

  const handleSurprise = () => {
    setSelectedMood(null);
    setResults(getSurpriseRecommendations(ratings, resultTypeFilter));
    setAnimateIn(false);
    setTimeout(() => { setView("results"); setAnimateIn(true); }, 50);
  };

  const [refreshKey, setRefreshKey] = useState(0);

  const refreshResults = () => {
    setResults([]);
    setAnimateIn(false);
    setTimeout(() => {
      const recs = selectedMood
        ? getRecommendations(selectedMood, ratings, resultTypeFilter)
        : getSurpriseRecommendations(ratings, resultTypeFilter);
      setResults([...recs]);
      setRefreshKey(k => k + 1);
      setTimeout(() => setAnimateIn(true), 50);
    }, 80);
  };

  // When type filter changes in results view, refresh
  const changeResultTypeFilter = (f) => {
    setResultTypeFilter(f);
    const recs = selectedMood
      ? getRecommendations(selectedMood, ratings, f)
      : getSurpriseRecommendations(ratings, f);
    setResults(recs);
    setAnimateIn(false);
    setTimeout(() => setAnimateIn(true), 50);
  };

  const tasteProfile = getTasteProfile(ratings);
  const ratedCount = Object.keys(ratings).length;

  const filteredBrowse = DB.filter(m => {
    const q = browseSearch.toLowerCase();
    const matchSearch = m.title.toLowerCase().includes(q) ||
      m.tags.some(t => t.includes(q)) || m.moods.some(mood => mood.includes(q));
    const matchType = browseFilter === "all" || m.type === browseFilter;
    const matchMood = matchMoodSet(m.moods, browseMoodTag);
    const matchDec = matchDecade(m.year);
    return matchSearch && matchType && matchMood && matchDec;
  });

  const TypeToggle = ({ value, onChange, style: s }) => (
    <div style={{ ...S.filterBtns, background: T.card, borderColor: T.border, ...s }}>
      {[["all", "All"], ["movie", "Films"], ["series", "Series"]].map(([f, label]) => (
        <button key={f} onClick={() => onChange(f)} style={{
          ...S.filterBtn, background: value === f ? (dark ? "#222" : T.border) : "transparent",
          color: value === f ? T.text : T.sub,
        }}>{label}</button>
      ))}
    </div>
  );

  const DecadeSelector = ({ value, onChange }) => (
    <div style={{ display: "flex", gap: 4, overflowX: "auto", paddingBottom: 6, marginBottom: 8 }}>
      {[["all", "All"], ["pre60", "Pre-60s"], ["1960", "60s"], ["1970", "70s"], ["1980", "80s"], ["1990", "90s"], ["2000", "00s"], ["2010", "10s"], ["2020", "20s"]].map(([v, label]) => (
        <button key={v} onClick={() => onChange(v)} style={{
          ...S.filterBtn, border: "1px solid", flexShrink: 0, fontSize: 11,
          borderColor: value === v ? T.accent : T.border,
          background: value === v ? T.accent + "18" : "transparent",
          color: value === v ? T.text : T.sub,
        }}>{label}</button>
      ))}
    </div>
  );

  const MoodTagStrip = ({ value, onChange }) => (
    <div style={{ display: "flex", gap: 4, overflowX: "auto", paddingBottom: 6, marginBottom: 6 }}>
      <button onClick={(e) => onChange("all", e)} style={{
        ...S.filterBtn, border: "1px solid", flexShrink: 0, fontSize: 11,
        borderColor: value.size === 0 ? T.accent : T.border,
        background: value.size === 0 ? T.accent + "18" : "transparent",
        color: value.size === 0 ? T.accent : T.sub,
      }}>All</button>
      {MOODS.map(m => {
        const isBlacklisted = blacklistedMoods.has(m.id);
        const isActive = value.has(m.id);
        return (
          <button
            key={m.id}
            onClick={(e) => onChange(m.id, e)}
            onContextMenu={(e) => onChange(m.id, e)}
            title="Alt+Click to Blacklist"
            style={{
              ...S.filterBtn, border: "1px solid", flexShrink: 0, fontSize: 11,
              borderColor: isBlacklisted ? "#D63031" : (isActive ? m.color : T.border),
              background: isBlacklisted ? "#D6303120" : (isActive ? m.color + "18" : "transparent"),
              color: isBlacklisted ? "#D63031" : (isActive ? m.color : T.sub),
              textDecoration: isBlacklisted ? "line-through" : "none",
            }}
          >
            {isBlacklisted ? "✕" : m.icon} {m.label}
          </button>
        );
      })}
    </div>
  );


  return (
    <div style={{ ...S.appWrap, background: T.bg, color: T.text }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,300;0,9..40,400;0,9..40,500;0,9..40,600;1,9..40,300;1,9..40,400&family=Playfair+Display:wght@400;500;600;700&family=Playfair+Display+SC:wght@400;700;900&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { background: ${T.bg}; transition: background 0.3s; }
        input:focus, button:focus { outline: none; }
        ::selection { background: ${T.accent}44; }
        @keyframes fadeUp { from { opacity:0; transform:translateY(14px); } to { opacity:1; transform:translateY(0); } }
        @keyframes fadeIn { from { opacity:0; } to { opacity:1; } }
        @keyframes fadeOut { from { opacity:1; transform:translateY(0); } to { opacity:0; transform:translateY(-8px); } }
        @keyframes slideIn { from { opacity:0; transform:translateY(12px); } to { opacity:1; transform:translateY(0); } }
        button { cursor: pointer; font-family: inherit; }
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: ${dark ? "#333" : "#CCC"}; border-radius: 4px; }
      `}</style>

      <div style={S.container}>
        {/* HEADER */}
        <header style={{ ...S.header, borderColor: T.border, flexDirection: "column", gap: 10, alignItems: "center" }}>
          <button onClick={() => { setView("home"); setSelectedMood(null); }} style={{ ...S.logoBtn, gap: 8 }}
            onMouseEnter={e => { e.currentTarget.style.opacity = "0.7"; }}
            onMouseLeave={e => { e.currentTarget.style.opacity = "1"; }}>
            <span style={{ fontSize: 40, lineHeight: 1, color: "#E8637A" }}>◉</span>
            <span style={{ fontFamily: "'Playfair Display SC','Playfair Display',Georgia,serif", fontSize: 48, fontWeight: 900, color: T.text, letterSpacing: "3px" }}>What To Flick</span>
          </button>
          <nav style={{ ...S.nav, width: "100%", justifyContent: "center" }}>
            <button onClick={() => setDark(!dark)} style={{ ...S.navBtn, color: T.sub, fontSize: 16 }} title="Toggle theme">{dark ? "◐" : "◑"}</button>
            <button onClick={() => setView("browse")} style={{ ...S.navBtn, color: view === "browse" ? T.text : T.sub }}>Browse</button>
            <button onClick={() => setView("rated")} style={{ ...S.navBtn, color: view === "rated" ? T.text : T.sub }}>
              Rated{ratedCount > 0 && <span style={{ ...S.badge, background: "#7B8FA1" }}>{ratedCount}</span>}
            </button>
            <button onClick={() => setView("watchlist")} style={{ ...S.navBtn, color: view === "watchlist" ? T.text : T.sub }}>
              Later{watchlist.length > 0 && <span style={S.badge}>{watchlist.length}</span>}
            </button>
            <button onClick={() => setView("stats")} style={{ ...S.navBtn, color: view === "stats" ? T.text : T.sub }}>Stats</button>
          </nav>
        </header>

        {/* HOME */}
        {view === "home" && (
          <div style={{ animation: "fadeIn 0.4s ease" }}>
            <div style={S.hero}>
              <h1 style={{ fontFamily: "'Playfair Display',Georgia,serif", fontSize: 36, fontWeight: 400, lineHeight: 1.2, letterSpacing: "-0.5px", color: dark ? "#F0F0F0" : "#1A1A1A", fontStyle: "italic" }}>What are you<br />in the mood for?</h1>
              {tasteProfile.length > 0 && <p style={S.tasteHint}>You tend to enjoy: {tasteProfile.join(", ")}</p>}
            </div>
            <div style={S.moodGrid}>
              {MOODS.map((mood, i) => (
                <button key={mood.id} onClick={() => selectMood(mood.id)} style={{
                  ...S.moodBtn, animation: `fadeUp 0.4s ease ${i * 0.04}s both`, borderColor: mood.color + "30",
                }}
                  onMouseEnter={e => { e.currentTarget.style.borderColor = mood.color; e.currentTarget.style.background = mood.color + "08"; }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = mood.color + "30"; e.currentTarget.style.background = "transparent"; }}
                >
                  <span style={{ ...S.moodIcon, color: mood.color }}>{mood.icon}</span>
                  <span style={S.moodLabel}>{mood.label}</span>
                </button>
              ))}
            </div>
            <button onClick={handleSurprise} style={{ ...S.surpriseBtn, background: T.hover, borderColor: T.border, color: T.sub }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = "#444"; e.currentTarget.style.color = "#CCC"; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = "#2A2A2E"; e.currentTarget.style.color = "#999"; }}
            ><span style={{ fontSize: 16 }}>✦</span> Surprise me</button>
            <p style={S.statsText}>{ratedCount > 0 ? `${ratedCount} rated · ${DB.length - ratedCount} to discover` : `${DB.length} titles · rate what you've seen to improve picks`}</p>
          </div>
        )}

        {/* RESULTS */}
        {view === "results" && (
          <div style={{ animation: "fadeIn 0.3s ease" }}>
            <div style={S.resultsHeader}>
              <div>
                <button onClick={() => { setView("home"); setSelectedMood(null); }} style={S.backBtn}>← Back</button>
                <h2 style={S.resultsTitle}>
                  {selectedMood ? `${MOOD_MAP[selectedMood]?.icon} ${MOOD_MAP[selectedMood]?.label}` : "✦ Surprise picks"}
                </h2>
                <p style={S.resultsSub}>{results.length === 0 ? "You've rated everything here — try another mood" : "Rate to swap in new picks"}</p>
              </div>
              <button onClick={refreshResults} style={S.refreshBtn}
                onMouseEnter={e => { e.currentTarget.style.borderColor = "#444"; }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = "#2A2A2E"; }}
              >↻ Refresh</button>
            </div>
            <TypeToggle value={resultTypeFilter} onChange={changeResultTypeFilter} style={{ marginBottom: 14 }} />
            <div style={S.list}>
              {results.map((movie, i) => (
                <MovieCard theme={T} key={`${movie.id}-${refreshKey}`} movie={movie} rating={ratings[movie.id]}
                  onRate={handleRateInResults} onWatchlist={handleWatchlist}
                  isOnWatchlist={watchlist.includes(movie.id)} isExiting={exitingIds.has(movie.id)}
                  style={{
                    animation: exitingIds.has(movie.id) ? undefined
                      : animateIn ? `fadeUp 0.35s ease ${i * 0.05}s both` : `slideIn 0.3s ease both`,
                    opacity: animateIn || exitingIds.has(movie.id) ? undefined : 0,
                  }}
                />
              ))}
            </div>
          </div>
        )}

        {/* BROWSE */}
        {view === "browse" && (
          <div style={{ animation: "fadeIn 0.3s ease" }}>
            <div style={S.browseHead}>
              <h2 style={S.browseTitle}>Browse & Rate</h2>
              <p style={S.browseSub}>Rate titles to teach the app your taste</p>
            </div>
            <div style={S.browseCtrl}>
              <input type="text" placeholder="Search titles, tags, moods..." value={browseSearch}
                onChange={e => setBrowseSearch(e.target.value)} style={{ ...S.searchInput, background: T.card, borderColor: T.border, color: T.text }} />
              <TypeToggle value={browseFilter} onChange={setBrowseFilter} />
            </div>
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 11, color: T.dim, marginBottom: 4, textTransform: "uppercase", letterSpacing: "1px" }}>⌛ Time Machine</div>
              <DecadeSelector value={selectedDecade} onChange={setSelectedDecade} />
            </div>
            <MoodTagStrip value={browseMoodTag} onChange={toggleMoodTag(setBrowseMoodTag)} />
            <div style={{ ...S.browseCount, color: T.dim }}>{filteredBrowse.length} titles</div>
            <div style={S.list}>
              {filteredBrowse.map((movie, i) => (
                <MovieCard theme={T} key={movie.id} movie={movie} rating={ratings[movie.id]}
                  onRate={handleRate} onWatchlist={handleWatchlist}
                  isOnWatchlist={watchlist.includes(movie.id)}
                  style={{ animation: `fadeUp 0.25s ease ${Math.min(i, 12) * 0.025}s both` }}
                />
              ))}
            </div>
          </div>
        )}

        {/* RATED */}
        {view === "rated" && (() => {
          const ratedEntries = Object.entries(ratings).map(([id, v]) => ({ movie: DB.find(m => m.id === +id), rating: v })).filter(x => x.movie);
          const likeCount = ratedEntries.filter(x => x.rating === "like").length;
          const neutralCount = ratedEntries.filter(x => x.rating === "neutral").length;
          const dislikeCount = ratedEntries.filter(x => x.rating === "dislike").length;
          const filtered = ratedEntries.filter(x => (ratedFilter === "all" || x.rating === ratedFilter) && (ratedType === "all" || x.movie.type === ratedType) && matchMoodSet(x.movie.moods, ratedMoodTag));
          return (
            <div style={{ animation: "fadeIn 0.3s ease" }}>
              <div style={S.browseHead}>
                <h2 style={S.browseTitle}>Your Ratings</h2>
                <p style={S.browseSub}>{ratedCount === 0 ? "Nothing rated yet — pick a mood and start rating" : "Tap a rating to change or remove it"}</p>
              </div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 12 }}>
                {[["all", "All", null, ratedCount], ["like", "Liked", "#55A38B", likeCount], ["neutral", "Seen", "#888", neutralCount], ["dislike", "Disliked", "#E8637A", dislikeCount]].map(([v, l, clr, ct]) =>
                  <button key={v} onClick={() => setRatedFilter(v)} style={{
                    ...S.filterBtn, border: "1px solid",
                    borderColor: ratedFilter === v ? (clr || "#555") : "#1A1A1E",
                    background: ratedFilter === v ? (clr ? clr + "15" : "#222") : "#111113",
                    color: ratedFilter === v ? (clr || "#E8E8E8") : "#666",
                  }}>{l} <span style={{ marginLeft: 3, opacity: .6 }}>({ct})</span></button>
                )}
                <TypeToggle value={ratedType} onChange={setRatedType} />
              </div>
              <MoodTagStrip value={ratedMoodTag} onChange={toggleMoodTag(setRatedMoodTag)} />
              <div style={{ ...S.browseCount, color: T.dim }}>{filtered.length} titles</div>
              <div style={S.list}>
                {filtered.map(({ movie, rating: r }, i) => (
                  <MovieCard theme={T} key={movie.id} movie={movie} rating={r}
                    onRate={handleRate} onWatchlist={handleWatchlist}
                    isOnWatchlist={watchlist.includes(movie.id)}
                    style={{ animation: `fadeUp 0.25s ease ${Math.min(i, 12) * 0.025}s both` }} />
                ))}
              </div>
            </div>
          );
        })()}

        {/* WATCHLIST */}
        {view === "watchlist" && (() => {
          const wlMovies = watchlist.map(id => DB.find(m => m.id === id)).filter(Boolean);
          const filtWL = wlMovies.filter(m => (wlType === "all" || m.type === wlType) && matchMoodSet(m.moods, wlMoodTag));
          return (
            <div style={{ animation: "fadeIn 0.3s ease" }}>
              <div style={S.browseHead}>
                <h2 style={{ ...S.browseTitle, color: T.text }}>Watch Later</h2>
                <p style={{ ...S.browseSub, color: T.sub }}>{watchlist.length === 0 ? "Tap ☆ on any title to save it here" : `${watchlist.length} saved`}</p>
              </div>
              <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
                <TypeToggle value={wlType} onChange={setWlType} />
              </div>
              <MoodTagStrip value={wlMoodTag} onChange={toggleMoodTag(setWlMoodTag)} />
              <div style={{ ...S.browseCount, color: T.dim }}>{filtWL.length} titles</div>
              <div style={S.list}>
                {filtWL.map((movie, i) => (
                  <MovieCard theme={T} key={movie.id} movie={movie} rating={ratings[movie.id]}
                    onRate={handleRate} onWatchlist={handleWatchlist} isOnWatchlist={true}
                    style={{ animation: `fadeUp 0.25s ease ${i * 0.04}s both` }} />
                ))}
              </div>
            </div>);
        })()}

        {/* STATS */}
        {view === "stats" && (() => {
          const entries = Object.entries(ratings);
          const liked = entries.filter(([, v]) => v === "like");
          const disliked = entries.filter(([, v]) => v === "dislike");
          const neutral = entries.filter(([, v]) => v === "neutral");
          const total = entries.length;
          const pct = (n) => total ? Math.round((n / total) * 100) : 0;

          // Top tags from liked
          const tagCount = {};
          liked.forEach(([id]) => {
            const m = DB.find(x => x.id === +id);
            if (m) m.tags.forEach(t => { tagCount[t] = (tagCount[t] || 0) + 1; });
          });
          const topTags = Object.entries(tagCount).sort((a, b) => b[1] - a[1]).slice(0, 8);

          // Mood breakdown
          const moodLiked = {};
          const moodDisliked = {};
          MOODS.forEach(m => { moodLiked[m.id] = 0; moodDisliked[m.id] = 0; });
          liked.forEach(([id]) => {
            const m = DB.find(x => x.id === +id);
            if (m) m.moods.forEach(mood => { moodLiked[mood] = (moodLiked[mood] || 0) + 1; });
          });
          disliked.forEach(([id]) => {
            const m = DB.find(x => x.id === +id);
            if (m) m.moods.forEach(mood => { moodDisliked[mood] = (moodDisliked[mood] || 0) + 1; });
          });

          // Decade breakdown
          const decadeCount = {};
          liked.forEach(([id]) => {
            const m = DB.find(x => x.id === +id);
            if (m) { const d = Math.floor(m.year / 10) * 10; decadeCount[d] = (decadeCount[d] || 0) + 1; }
          });
          const decades = Object.entries(decadeCount).sort((a, b) => +a[0] - +b[0]);
          const maxDecade = Math.max(...decades.map(([, c]) => c), 1);

          // Type split
          const likedMovies = liked.filter(([id]) => DB.find(x => x.id === +id)?.type === "movie").length;
          const likedSeries = liked.length - likedMovies;

          const sBox = { background: T.card, border: `1px solid ${T.border}`, borderRadius: 12, padding: "16px 18px", marginBottom: 10 };
          const sLabel = { fontSize: 11, color: T.sub, textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 10, fontWeight: 500 };
          const sNum = { fontFamily: "'Playfair Display',serif", fontSize: 32, fontWeight: 600, color: T.text, lineHeight: 1 };

          return (
            <div style={{ animation: "fadeIn 0.3s ease" }}>
              <div style={{ textAlign: "center", padding: "24px 0 20px" }}>
                <h2 style={{ fontFamily: "'Playfair Display',serif", fontSize: 26, fontWeight: 400, color: T.text }}>Your Stats</h2>
                <p style={{ fontSize: 13, color: T.sub, marginTop: 6 }}>{total === 0 ? "Rate some titles to see your stats" : `Based on ${total} ratings`}</p>
              </div>

              {total > 0 && <>
                {/* Overview row */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 10 }}>
                  <div style={{ ...sBox, textAlign: "center" }}>
                    <div style={{ ...sNum, color: "#55A38B" }}>{liked.length}</div>
                    <div style={{ fontSize: 11, color: T.sub, marginTop: 4 }}>Liked</div>
                  </div>
                  <div style={{ ...sBox, textAlign: "center" }}>
                    <div style={{ ...sNum, color: "#888" }}>{neutral.length}</div>
                    <div style={{ fontSize: 11, color: T.sub, marginTop: 4 }}>Seen</div>
                  </div>
                  <div style={{ ...sBox, textAlign: "center" }}>
                    <div style={{ ...sNum, color: "#E8637A" }}>{disliked.length}</div>
                    <div style={{ fontSize: 11, color: T.sub, marginTop: 4 }}>Disliked</div>
                  </div>
                </div>

                {/* Progress */}
                <div style={sBox}>
                  <div style={sLabel}>Collection Progress</div>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                    <span style={{ fontSize: 13, color: T.textSoft }}>{total} of {DB.length} titles rated</span>
                    <span style={{ fontSize: 13, color: T.accent, fontWeight: 500 }}>{Math.round((total / DB.length) * 100)}%</span>
                  </div>
                  <div style={{ height: 6, background: T.pill, borderRadius: 3, overflow: "hidden" }}>
                    <div style={{ height: "100%", borderRadius: 3, background: `linear-gradient(90deg, #55A38B ${pct(liked.length)}%, #888 ${pct(liked.length)}% ${pct(liked.length) + pct(neutral.length)}%, #E8637A ${pct(liked.length) + pct(neutral.length)}% 100%)`, width: `${Math.round((total / DB.length) * 100)}%`, transition: "width 0.5s" }} />
                  </div>
                </div>

                {/* Type split */}
                {liked.length > 0 && <div style={sBox}>
                  <div style={sLabel}>What You Like</div>
                  <div style={{ display: "flex", gap: 12, marginBottom: 12 }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                        <span style={{ fontSize: 12, color: T.textSoft }}>Films</span>
                        <span style={{ fontSize: 12, color: T.accent }}>{likedMovies}</span>
                      </div>
                      <div style={{ height: 4, background: T.pill, borderRadius: 2 }}>
                        <div style={{ height: "100%", borderRadius: 2, background: T.accent, width: `${liked.length ? (likedMovies / liked.length) * 100 : 0}%` }} />
                      </div>
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                        <span style={{ fontSize: 12, color: T.textSoft }}>Series</span>
                        <span style={{ fontSize: 12, color: "#F5A623" }}>{likedSeries}</span>
                      </div>
                      <div style={{ height: 4, background: T.pill, borderRadius: 2 }}>
                        <div style={{ height: "100%", borderRadius: 2, background: "#F5A623", width: `${liked.length ? (likedSeries / liked.length) * 100 : 0}%` }} />
                      </div>
                    </div>
                  </div>
                </div>}

                {/* Mood affinity */}
                {liked.length > 0 && <div style={sBox}>
                  <div style={sLabel}>Mood Affinity</div>
                  {MOODS.map(m => {
                    const lk = moodLiked[m.id] || 0;
                    const dk = moodDisliked[m.id] || 0;
                    const maxM = Math.max(...Object.values(moodLiked), 1);
                    if (lk === 0 && dk === 0) return null;
                    return (
                      <div key={m.id} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                        <span style={{ width: 70, fontSize: 12, color: m.color, flexShrink: 0 }}>{m.icon} {m.label}</span>
                        <div style={{ flex: 1, height: 8, background: T.pill, borderRadius: 4, overflow: "hidden", display: "flex" }}>
                          <div style={{ height: "100%", background: m.color, width: `${(lk / maxM) * 100}%`, borderRadius: 4, transition: "width 0.4s" }} />
                        </div>
                        <span style={{ fontSize: 11, color: T.sub, width: 20, textAlign: "right" }}>{lk}</span>
                      </div>
                    );
                  })}
                </div>}

                {/* Decade distribution */}
                {decades.length > 0 && <div style={sBox}>
                  <div style={sLabel}>Decades You Love</div>
                  <div style={{ display: "flex", alignItems: "flex-end", gap: 4, height: 80 }}>
                    {decades.map(([d, c]) => (
                      <div key={d} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
                        <span style={{ fontSize: 10, color: T.accent, fontWeight: 500 }}>{c}</span>
                        <div style={{ width: "100%", background: T.accent, borderRadius: 3, height: `${(c / maxDecade) * 60}px`, transition: "height 0.4s", minHeight: 4 }} />
                        <span style={{ fontSize: 9, color: T.sub }}>{String(d).slice(2)}s</span>
                      </div>
                    ))}
                  </div>
                </div>}

                {/* Top tags */}
                {topTags.length > 0 && <div style={sBox}>
                  <div style={sLabel}>Your Favourite Tags</div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                    {topTags.map(([tag, count], i) => (
                      <span key={tag} style={{
                        fontSize: 12, padding: "5px 12px", borderRadius: 20,
                        background: i === 0 ? T.accent + "20" : T.pill,
                        color: i === 0 ? T.accent : T.textSoft,
                        border: `1px solid ${i === 0 ? T.accent + "40" : T.border}`,
                      }}>{tag.replace(/-/g, " ")} <span style={{ opacity: 0.5 }}>×{count}</span></span>
                    ))}
                  </div>
                </div>}
              </>}
            </div>
          );
        })()}
      </div>
    </div>
  );
}

const TH = {
  dark: { bg: "#0C0C0E", card: "#111113", border: "#1A1A1E", text: "#E8E8E8", textSoft: "#C8C8C8", sub: "#555", dim: "#444", pill: "#1A1A1E", pillText: "#777", input: "#111113", hover: "#141416", accent: "#55A38B" },
  light: { bg: "#F5F3EE", card: "#FFFFFF", border: "#E2DFD8", text: "#1A1A1A", textSoft: "#333", sub: "#888", dim: "#AAA", pill: "#EBE8E2", pillText: "#666", input: "#FFFFFF", hover: "#F0EDE7", accent: "#3D8B72" },
};

const S = {
  appWrap: { minHeight: "100vh", background: "#0C0C0E", color: "#E8E8E8", fontFamily: "'DM Sans', -apple-system, sans-serif" },
  container: { maxWidth: 560, margin: "0 auto", padding: "0 20px 60px" },
  header: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "20px 0", borderBottom: "1px solid #1A1A1E", marginBottom: 8 },
  logoBtn: { background: "none", border: "none", padding: 0, display: "flex", alignItems: "baseline" },
  logoText: { fontFamily: "'Playfair Display', Georgia, serif", fontSize: 17, fontWeight: 500, color: "#E8E8E8", letterSpacing: "-0.3px" },
  nav: { display: "flex", gap: 4, alignItems: "center" },
  navBtn: { background: "none", border: "none", fontSize: 13, fontWeight: 400, padding: "6px 12px", borderRadius: 6, transition: "color 0.2s", display: "flex", alignItems: "center", gap: 6 },
  badge: { background: "#55A38B", color: "#0C0C0E", fontSize: 10, fontWeight: 600, padding: "1px 6px", borderRadius: 10 },
  hero: { textAlign: "center", padding: "48px 0 40px" },
  heroTitle: { fontFamily: "'Playfair Display', Georgia, serif", fontSize: 36, fontWeight: 400, lineHeight: 1.2, letterSpacing: "-0.5px", color: "#F0F0F0" },
  tasteHint: { fontSize: 13, color: "#666", marginTop: 16, fontStyle: "italic" },
  moodGrid: { display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 10, marginBottom: 24 },
  moodBtn: { display: "flex", alignItems: "center", gap: 12, padding: "16px 18px", background: "transparent", border: "1px solid", borderRadius: 10, transition: "all 0.25s ease", textAlign: "left" },
  moodIcon: { fontSize: 20, width: 28, textAlign: "center", flexShrink: 0 },
  moodLabel: { fontSize: 14, fontWeight: 400, color: "#C8C8C8", letterSpacing: "0.2px" },
  surpriseBtn: { display: "flex", alignItems: "center", justifyContent: "center", gap: 8, width: "100%", padding: "16px", background: "#141416", border: "1px solid #2A2A2E", borderRadius: 10, color: "#999", fontSize: 14, fontWeight: 400, transition: "all 0.25s ease", marginBottom: 32 },
  statsText: { textAlign: "center", fontSize: 12, color: "#444" },
  resultsHeader: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", padding: "24px 0 16px" },
  backBtn: { background: "none", border: "none", color: "#666", fontSize: 13, padding: "4px 0", marginBottom: 8, display: "block" },
  resultsTitle: { fontFamily: "'Playfair Display', Georgia, serif", fontSize: 26, fontWeight: 400, color: "#F0F0F0", letterSpacing: "-0.3px" },
  resultsSub: { fontSize: 13, color: "#555", marginTop: 6 },
  refreshBtn: { background: "#141416", border: "1px solid #2A2A2E", color: "#888", fontSize: 13, padding: "8px 14px", borderRadius: 8, marginTop: 30, whiteSpace: "nowrap", transition: "all 0.2s" },
  list: { display: "flex", flexDirection: "column", gap: 6 },
  card: { display: "flex", alignItems: "center", gap: 14, padding: "12px 14px", background: "#111113", borderRadius: 10, border: "1px solid #1A1A1E", transition: "all 0.2s" },
  poster: { width: 42, height: 42, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, background: "#0C0C0E", borderRadius: 8, border: "1px solid" },
  info: { flex: 1, minWidth: 0 },
  title: { fontSize: 14, fontWeight: 500, color: "#E0E0E0", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" },
  meta: { fontSize: 12, color: "#555", marginTop: 2 },
  tags: { display: "flex", gap: 4, marginTop: 5, flexWrap: "wrap" },
  tagPill: { fontSize: 10, fontWeight: 400, padding: "2px 7px", borderRadius: 4, background: "#1A1A1E", color: "#777", letterSpacing: "0.2px" },
  actions: { display: "flex", flexDirection: "column", gap: 1, flexShrink: 0 },
  rBtn: { width: 30, height: 26, display: "flex", alignItems: "center", justifyContent: "center", border: "none", borderRadius: 5, fontSize: 12, fontWeight: 600, transition: "all 0.15s" },
  browseHead: { padding: "24px 0 20px" },
  browseTitle: { fontFamily: "'Playfair Display', Georgia, serif", fontSize: 26, fontWeight: 400, color: "#F0F0F0", letterSpacing: "-0.3px" },
  browseSub: { fontSize: 13, color: "#555", marginTop: 6 },
  browseCtrl: { display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap" },
  searchInput: { flex: 1, minWidth: 180, padding: "10px 14px", background: "#111113", border: "1px solid #1A1A1E", borderRadius: 8, color: "#E8E8E8", fontSize: 13, fontFamily: "inherit" },
  filterBtns: { display: "flex", gap: 2, background: "#111113", borderRadius: 8, padding: 2, border: "1px solid #1A1A1E" },
  filterBtn: { padding: "8px 14px", border: "none", borderRadius: 6, fontSize: 12, fontWeight: 500, transition: "all 0.2s" },
  browseCount: { fontSize: 12, color: "#444", marginBottom: 12 },
};
