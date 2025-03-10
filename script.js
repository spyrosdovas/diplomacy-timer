import React, { useState, useEffect, useRef } from 'react';

const DiplomacyTimer = () => {
  const [page, setPage] = useState('setup');
  
  // Setup values
  const [springMinutes, setSpringMinutes] = useState(14);
  const [fallMinutes, setFallMinutes] = useState(12);
  const [orderMinutes, setOrderMinutes] = useState(1);
  const [winterMinutes, setWinterMinutes] = useState(2);
  const [autoPause, setAutoPause] = useState(true);
  
  // Timer state
  const [currentYear, setCurrentYear] = useState(1901);
  const [currentPhase, setCurrentPhase] = useState('Spring Negotiation');
  const [seconds, setSeconds] = useState(0);
  const [timerRunning, setTimerRunning] = useState(false);
  const [timerPaused, setTimerPaused] = useState(false);
  
  // Timer interval reference
  const timerInterval = useRef(null);
  
  // Handle start button click
  const handleStartClick = () => {
    console.log("Start button clicked!");
    setSeconds(springMinutes * 60);
    setPage('timer');
    console.log("Page state set to 'timer'");
  };
  
  // Reset timer
  const resetTimer = () => {
    clearInterval(timerInterval.current);
    setPage('setup');
    setCurrentYear(1901);
    setCurrentPhase('Spring Negotiation');
    setTimerRunning(false);
    setTimerPaused(false);
  };
  
  // Format time as MM:SS
  const formatTime = (totalSeconds) => {
    const minutes = Math.floor(totalSeconds / 60);
    const remainingSeconds = totalSeconds % 60;
    return `${String(minutes).padStart(2, '0')}:${String(remainingSeconds).padStart(2, '0')}`;
  };
  
  // Adjust time
  const adjustTime = (delta) => {
    setSeconds(prev => Math.max(0, prev + delta));
  };
  
  // Toggle timer running state
  const toggleTimer = () => {
    setTimerRunning(!timerRunning);
    setTimerPaused(false);
  };
  
  // Toggle pause state
  const togglePause = () => {
    setTimerPaused(!timerPaused);
  };
  
  // Move to next phase
  const goToNextPhase = () => {
    clearInterval(timerInterval.current);
    setTimerRunning(false);
    
    switch(currentPhase) {
      case 'Spring Negotiation':
        if (orderMinutes > 0) {
          setCurrentPhase('Spring Order Writing');
          setSeconds(orderMinutes * 60);
        } else {
          setCurrentPhase('Fall Negotiation');
          setSeconds(fallMinutes * 60);
        }
        break;
      case 'Spring Order Writing':
        setCurrentPhase('Fall Negotiation');
        setSeconds(fallMinutes * 60);
        if (autoPause) setTimerPaused(true);
        break;
      case 'Fall Negotiation':
        if (orderMinutes > 0) {
          setCurrentPhase('Fall Order Writing');
          setSeconds(orderMinutes * 60);
        } else {
          setCurrentPhase('Winter Build/Disband');
          setSeconds(winterMinutes * 60);
        }
        break;
      case 'Fall Order Writing':
        setCurrentPhase('Winter Build/Disband');
        setSeconds(winterMinutes * 60);
        if (autoPause) setTimerPaused(true);
        break;
      case 'Winter Build/Disband':
        setCurrentYear(y => y + 1);
        setCurrentPhase('Spring Negotiation');
        setSeconds(springMinutes * 60);
        if (autoPause) setTimerPaused(true);
        break;
    }
  };
  
  // Go to previous phase
  const goToPrevPhase = () => {
    clearInterval(timerInterval.current);
    setTimerRunning(false);
    
    switch(currentPhase) {
      case 'Spring Negotiation':
        if (currentYear > 1901) {
          setCurrentYear(y => y - 1);
          setCurrentPhase('Winter Build/Disband');
          setSeconds(winterMinutes * 60);
        }
        break;
      case 'Spring Order Writing':
        setCurrentPhase('Spring Negotiation');
        setSeconds(springMinutes * 60);
        break;
      case 'Fall Negotiation':
        if (orderMinutes > 0) {
          setCurrentPhase('Spring Order Writing');
          setSeconds(orderMinutes * 60);
        } else {
          setCurrentPhase('Spring Negotiation');
          setSeconds(springMinutes * 60);
        }
        break;
      case 'Fall Order Writing':
        setCurrentPhase('Fall Negotiation');
        setSeconds(fallMinutes * 60);
        break;
      case 'Winter Build/Disband':
        if (orderMinutes > 0) {
          setCurrentPhase('Fall Order Writing');
          setSeconds(orderMinutes * 60);
        } else {
          setCurrentPhase('Fall Negotiation');
          setSeconds(fallMinutes * 60);
        }
        break;
    }
  };
  
  // Announce remaining time
  const announceTime = (remainingSeconds) => {
    if (!window.speechSynthesis) return;
    
    window.speechSynthesis.cancel();
    
    let message = '';
    if (remainingSeconds === 600) message = '10 minutes remaining';
    else if (remainingSeconds === 300) message = '5 minutes remaining';
    else if (remainingSeconds === 60) message = '1 minute remaining';
    else if (remainingSeconds === 30) message = '30 seconds remaining';
    else if (remainingSeconds === 15) message = '15 seconds remaining';
    else if (remainingSeconds <= 10 && remainingSeconds > 0) message = `${remainingSeconds}`;
    else if (remainingSeconds === 0) message = 'Deadline!';
    
    if (message) {
      const utterance = new SpeechSynthesisUtterance(message);
      window.speechSynthesis.speak(utterance);
    }
  };
  
  // Timer effect
  useEffect(() => {
    if (timerRunning && !timerPaused) {
      timerInterval.current = setInterval(() => {
        setSeconds(prev => {
          if ([600, 300, 60, 30, 15, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1, 0].includes(prev)) {
            announceTime(prev);
          }
          
          if (prev <= 0) {
            clearInterval(timerInterval.current);
            goToNextPhase();
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    } else {
      clearInterval(timerInterval.current);
    }
    
    return () => clearInterval(timerInterval.current);
  }, [timerRunning, timerPaused]);
  
  // Setup page
  if (page === 'setup') {
    return (
      <div style={{ 
        maxWidth: '600px', 
        margin: '0 auto', 
        padding: '20px', 
        fontFamily: 'Arial, sans-serif',
        backgroundColor: '#f5f5f5',
        borderRadius: '10px',
        boxShadow: '0 0 10px rgba(0,0,0,0.1)'
      }}>
        <h1 style={{ 
          textAlign: 'center', 
          color: '#333',
          fontSize: '28px',
          marginBottom: '20px'
        }}>
          Diplomacy Game Timer Setup
        </h1>
        
        <div style={{ marginBottom: '15px' }}>
          <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>
            Spring Negotiation (minutes):
          </label>
          <input 
            type="number" 
            min="1"
            value={springMinutes}
            onChange={e => setSpringMinutes(Math.max(1, parseInt(e.target.value) || 1))}
            style={{ 
              width: '100%', 
              padding: '8px', 
              fontSize: '16px',
              border: '1px solid #ccc',
              borderRadius: '4px'
            }}
          />
        </div>
        
        <div style={{ marginBottom: '15px' }}>
          <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>
            Fall Negotiation (minutes):
          </label>
          <input 
            type="number"
            min="1" 
            value={fallMinutes}
            onChange={e => setFallMinutes(Math.max(1, parseInt(e.target.value) || 1))}
            style={{ 
              width: '100%', 
              padding: '8px', 
              fontSize: '16px',
              border: '1px solid #ccc',
              borderRadius: '4px'
            }}
          />
        </div>
        
        <div style={{ marginBottom: '15px' }}>
          <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>
            Order Writing (minutes, 0 to skip):
          </label>
          <input 
            type="number"
            min="0" 
            value={orderMinutes}
            onChange={e => setOrderMinutes(Math.max(0, parseInt(e.target.value) || 0))}
            style={{ 
              width: '100%', 
              padding: '8px', 
              fontSize: '16px',
              border: '1px solid #ccc',
              borderRadius: '4px'
            }}
          />
        </div>
        
        <div style={{ marginBottom: '15px' }}>
          <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>
            Winter Build/Disband (minutes):
          </label>
          <input 
            type="number"
            min="1" 
            value={winterMinutes}
            onChange={e => setWinterMinutes(Math.max(1, parseInt(e.target.value) || 1))}
            style={{ 
              width: '100%', 
              padding: '8px', 
              fontSize: '16px',
              border: '1px solid #ccc',
              borderRadius: '4px'
            }}
          />
        </div>
        
        <div style={{ marginBottom: '20px' }}>
          <label style={{ display: 'flex', alignItems: 'center', fontWeight: 'bold' }}>
            <input 
              type="checkbox"
              checked={autoPause}
              onChange={() => setAutoPause(!autoPause)}
              style={{ marginRight: '8px', width: '20px', height: '20px' }}
            />
            Pause after order writing and winter phases
          </label>
        </div>
        
        <button 
          onClick={handleStartClick}
          style={{
            width: '100%',
            padding: '12px',
            backgroundColor: '#4CAF50',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            fontSize: '18px',
            fontWeight: 'bold',
            cursor: 'pointer'
          }}
        >
          Start Game
        </button>
      </div>
    );
  }
  
  // Timer page
  return (
    <div style={{ 
      maxWidth: '800px', 
      margin: '0 auto', 
      padding: '20px', 
      fontFamily: 'Arial, sans-serif',
      backgroundColor: '#f5f5f5',
      borderRadius: '10px',
      boxShadow: '0 0 10px rgba(0,0,0,0.1)'
    }}>
      <div style={{ 
        display: 'flex', 
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '20px'
      }}>
        <h2 style={{ fontSize: '24px', margin: 0 }}>{currentYear}</h2>
        <h2 style={{ fontSize: '24px', margin: 0 }}>{currentPhase}</h2>
        <button 
          onClick={resetTimer}
          style={{
            backgroundColor: '#f44336',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            padding: '8px 16px',
            fontSize: '16px',
            cursor: 'pointer'
          }}
        >
          Reset
        </button>
      </div>
      
      <div style={{ textAlign: 'center', margin: '30px 0' }}>
        <div style={{ 
          fontSize: '300px', 
          fontFamily: 'monospace', 
          lineHeight: '1',
          fontWeight: 'bold'
        }}>
          {formatTime(seconds)}
        </div>
      </div>
      
      <div style={{ 
        display: 'flex', 
        justifyContent: 'center', 
        gap: '10px',
        flexWrap: 'wrap',
        marginBottom: '20px'
      }}>
        <button 
          onClick={() => adjustTime(60)}
          style={{
            backgroundColor: '#2196F3',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            padding: '8px 16px',
            fontSize: '16px',
            cursor: 'pointer'
          }}
        >
          &#171;&#171;&#171;
        </button>
        <button 
          onClick={() => adjustTime(10)}
          style={{
            backgroundColor: '#2196F3',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            padding: '8px 16px',
            fontSize: '16px',
            cursor: 'pointer'
          }}
        >
          &#171;&#171;
        </button>
        <button 
          onClick={() => adjustTime(1)}
          style={{
            backgroundColor: '#2196F3',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            padding: '8px 16px',
            fontSize: '16px',
            cursor: 'pointer'
          }}
        >
          &#171;
        </button>
        <button 
          onClick={() => adjustTime(-1)}
          style={{
            backgroundColor: '#2196F3',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            padding: '8px 16px',
            fontSize: '16px',
            cursor: 'pointer'
          }}
        >
          &#187;
        </button>
        <button 
          onClick={() => adjustTime(-10)}
          style={{
            backgroundColor: '#2196F3',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            padding: '8px 16px',
            fontSize: '16px',
            cursor: 'pointer'
          }}
        >
          &#187;&#187;
        </button>
        <button 
          onClick={() => adjustTime(-60)}
          style={{
            backgroundColor: '#2196F3',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            padding: '8px 16px',
            fontSize: '16px',
            cursor: 'pointer'
          }}
        >
          &#187;&#187;&#187;
        </button>
      </div>
      
      <div style={{ 
        display: 'flex', 
        justifyContent: 'center', 
        gap: '15px',
        flexWrap: 'wrap'
      }}>
        <button 
          onClick={goToPrevPhase}
          style={{
            backgroundColor: '#2196F3',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            padding: '12px 24px',
            fontSize: '18px',
            cursor: 'pointer'
          }}
        >
          Previous Phase
        </button>
        
        <button 
          onClick={toggleTimer}
          style={{
            backgroundColor: timerRunning ? '#FF9800' : '#4CAF50',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            padding: '12px 24px',
            fontSize: '18px',
            cursor: 'pointer'
          }}
        >
          {timerRunning ? 'Stop' : 'Start'}
        </button>
        
        {timerRunning && (
          <button 
            onClick={togglePause}
            style={{
              backgroundColor: timerPaused ? '#4CAF50' : '#FF9800',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              padding: '12px 24px',
              fontSize: '18px',
              cursor: 'pointer'
            }}
          >
            {timerPaused ? 'Resume' : 'Pause'}
          </button>
        )}
        
        <button 
          onClick={goToNextPhase}
          style={{
            backgroundColor: '#2196F3',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            padding: '12px 24px',
            fontSize: '18px',
            cursor: 'pointer'
          }}
        >
          Next Phase
        </button>
      </div>
    </div>
  );
};


