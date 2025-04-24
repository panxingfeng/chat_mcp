import React, { useState, useRef, useEffect } from 'react';
import './AudioPlayer.css';

function AudioPlayer({ src, fileName }) {
  const audioRef = useRef(null);
  const progressRef = useRef(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (audioRef.current) {
      const audio = audioRef.current;

      const updateTime = () => setCurrentTime(audio.currentTime);
      const updateDuration = () => {
        setDuration(audio.duration);
        setLoading(false);
      };
      const resetPlayer = () => setIsPlaying(false);
      const handleError = (e) => {
        console.error('音频加载失败:', e);
        setError(true);
        setLoading(false);
      };

      audio.addEventListener('timeupdate', updateTime);
      audio.addEventListener('loadedmetadata', updateDuration);
      audio.addEventListener('canplay', () => setLoading(false));
      audio.addEventListener('ended', resetPlayer);
      audio.addEventListener('error', handleError);

      return () => {
        audio.removeEventListener('timeupdate', updateTime);
        audio.removeEventListener('loadedmetadata', updateDuration);
        audio.removeEventListener('canplay', () => setLoading(false));
        audio.removeEventListener('ended', resetPlayer);
        audio.removeEventListener('error', handleError);
      };
    }

    return () => {};
  }, [src]);

  useEffect(() => {
    if (src) {
      setError(false);
      setLoading(true);
      setCurrentTime(0);
      setIsPlaying(false);
    }
  }, [src]);

  const togglePlayPause = () => {
    if (error || loading) return;

    const audio = audioRef.current;

    if (isPlaying) {
      audio.pause();
    } else {
      audio.play().catch(err => {
        console.error('播放失败:', err);
        setError(true);
      });
    }

    setIsPlaying(!isPlaying);
  };

  const handleProgressChange = (e) => {
    if (error) return;

    const newTime = parseFloat(e.target.value);
    setCurrentTime(newTime);
    if (audioRef.current) {
      audioRef.current.currentTime = newTime;
    }
  };

  const handleProgressBarClick = (e) => {
    if (error || loading || !progressRef.current) return;

    const progressBar = progressRef.current;
    const rect = progressBar.getBoundingClientRect();
    const offsetX = e.clientX - rect.left;
    const newPercentage = offsetX / rect.width;
    const newTime = newPercentage * duration;

    setCurrentTime(newTime);
    if (audioRef.current) {
      audioRef.current.currentTime = newTime;
    }
  };

  const formatTime = (time) => {
    if (isNaN(time)) return '0:00';

    const minutes = Math.floor(time / 60);
    const seconds = Math.floor(time % 60).toString().padStart(2, '0');
    return `${minutes}:${seconds}`;
  };

  const getProgressPercentage = () => {
    if (duration === 0) return 0;
    return (currentTime / duration) * 100;
  };

  return (
    <div className={`audio-player ${error ? 'error' : ''}`}>
      {error ? (
        <div className="audio-error-message">
          <span className="error-icon">⚠️</span>
          <span>音频加载失败</span>
        </div>
      ) : (
        <div className="audio-player-controls">
          <button
            className="play-pause-button"
            onClick={togglePlayPause}
            disabled={loading}
            title={isPlaying ? "暂停" : "播放"}
          >
            {loading ? (
              <div className="loading-spinner"></div>
            ) : isPlaying ? (
              <svg viewBox="0 0 24 24" width="24" height="24">
                <rect x="6" y="4" width="4" height="16" />
                <rect x="14" y="4" width="4" height="16" />
              </svg>
            ) : (
              <svg viewBox="0 0 24 24" width="24" height="24">
                <polygon points="5,3 19,12 5,21" />
              </svg>
            )}
          </button>

          <div className="time-display current-time">{formatTime(currentTime)}</div>

          <div className="progress-container" ref={progressRef} onClick={handleProgressBarClick}>
            <div className="progress-background"></div>
            <div
              className="progress-filled"
              style={{ width: `${getProgressPercentage()}%` }}
            ></div>
            <input
              type="range"
              min="0"
              max={duration || 0}
              value={currentTime}
              step="0.01"
              className="progress-slider"
              onChange={handleProgressChange}
              disabled={loading || error}
            />
          </div>

          <div className="time-display duration">{formatTime(duration)}</div>
        </div>
      )}

      <audio ref={audioRef} src={src} preload="metadata" />
    </div>
  );
}

export default AudioPlayer;